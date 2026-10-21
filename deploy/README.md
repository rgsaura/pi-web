# Deploy: UI/API split en Docker + runner host (enc-29d7943d, prop-60ea3410=B)

## Arquitectura

```
:30152 ─▶ front (caddy) ─┬─ /api/* (SSE-safe) ─▶ api (stateless proxy) ─▶ RUNNER_URL ─┐
                         └─ /* ────────────────▶ web (UI-only, Next standalone)      │
                                                                                     │
   HOST (systemd pi-web-runner.service, :30164 en 172.17.0.1+loopback) ◀─────────────┘
   └─ TODO el API real: spawn de sesiones pi (SDK in-process), streaming SSE, PTY,
      git/worktrees, files, settings. Token obligatorio (X-Runner-Token).
```

Decisiones clave (prop-60ea3410 = **B**):

- **La API no toca el host**. El contenedor `api` es un proxy sin estado ni
  volúmenes; todo lo que requiere el host pasa por el runner.
- **El runner corre la MISMA imagen web** (`docker create` + `docker cp` →
  `~/workspaces/exohuman/runner/releases/<tag>/`), extraída por
  `deploy/deploy.sh runner`. Lo que QA validó es lo que corre; nunca se
  reconstruye entre entornos. El binario `node` también sale de la imagen
  (match exacto de ABI para `node-pty`).
- **Una imagen full, dos roles** vía `PI_WEB_ROLE` (ver `proxy.ts`):
  `web` (sólo UI, /api/* → 404) · `runner` (headless: UI → 404 + token) ·
  sin valor = app completa (dev, prod/pre systemd de hoy).
- PROD `:30141` y PRE `:30149` (systemd) **intactos hasta cutover aprobado**
  (encargo aparte tras QA sostenido). El cutover = parar el unit legacy y
  `FORCE_CUTOVER=1 WEB_PORT=30141 ./deploy.sh up` con la imagen ya promovida.

## Piezas

| Pieza | Hogar | Notas |
|---|---|---|
| `deploy/deploy.sh` | repo | ciclo de vida: all·images·runner·up·down·status·logs·rollback·self-test |
| `deploy/compose.yaml` + `Caddyfile` | repo | stack front+web+api (QA :30152) |
| `deploy/api-proxy/` | repo | contenedor api (server.mjs + Dockerfile, self-test incluido) |
| `deploy/runner/install.sh` | repo | bootstrap del system piece (idempotente) |
| env del runner | `~/.config/exohuman/pi-web-runner/env` | token, :30164, allowed hosts (600) |
| unit | `~/.config/systemd/user/pi-web-runner.service` (+ drop-in memoria) | `systemctl --user` |
| releases | `~/workspaces/exohuman/runner/releases/<tag>` + `current` → | 3 retenidos, switch atómico |
| recibo | `~/.local/state/exohuman/pi-web-runner/install.json` | auditoría |

Puertos: QA `:30152` (registro rg-port del encargo) · runner `:30164`
(fuera del rango dev 30145-30160 a propósito) · GHCR `ghcr.io/agegr/pi-web`
con tags `web-<t>` / `api-<t>`.

## Operación

```bash
# QA local (build en la VM; el proxy 127.0.0.1:1056 se pasa con --network host)
deploy/deploy.sh all                  # images + runner + stack + self-test

# Desde GHCR (lo que hace CI con vars.DEPLOY_QA_HOST configurado)
deploy/deploy.sh all --tag sha-abc1234

# Promoción pre→prod (misma imagen, GHCR retag; rollback = tag anterior)
#   gh workflow run promote.yml -f tag=sha-abc1234 -f target=prod -f confirm=promote-to-prod
deploy/deploy.sh rollback sha-previous

# Estado y probes
deploy/deploy.sh status               # runner + stack + probes HTTP reales
```

## CI/CD (GitHub Actions, agegr/pi-web)

1. `ci.yml` — PR/push main: lint + `tsc --noEmit` + tests + **self-test del
   api-proxy** + e2e (Playwright).
2. `build.yml` — tras CI verde en main/dev: build de **web** y **api** → GHCR
   (`web-sha-<sha7>`, `api-sha-<sha7>` + tag de rama) → deploy QA por SSH
   (opcional; requiere `vars.DEPLOY_QA_HOST`, `vars.DEPLOY_QA_USER`,
   `secrets.DEPLOY_QA_SSH_KEY` y el clone `~/workspaces/exohuman/qa-deploy`).
3. `promote.yml` — manual: retagea el MISMO digest a `web-pre|prod` /
   `api-pre|prod` y despliega en el puerto del entorno. `prod` exige
   `confirm=promote-to-prod`. El deploy a pre/prod respeta el guard de puertos
   legacy hasta el cutover.

## Notas operativas

- La sesión spawn-routing (`/api/agent/new`) vive en el runner (host): los
  encargos siguen naciendo en worktrees `wt-<hex8>` con `rg-*` en PATH.
- Las sesiones detached siguen siendo scopes `systemd-run --user` del host
  (sin cambios respecto a prod hoy).
- El navegador ve UN origen (`:30152`); caddy→api→runner preservan Host y
  añaden el token. La contraseña web (`PI_WEB_PASSWORD`), si existe, se
  configura en el env del runner (la aplica el runner, no el proxy).
- Si el stack cae, el runner sigue vivo (sesiones corriendo) y la UI legacy
  de `:30141`/`:30149` no se toca: fallback natural hasta el cutover.

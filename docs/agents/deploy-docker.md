# Deploy: UI/API split en Docker + runner host (enc-29d7943d)

Arquitectura resuelta en prop-60ea3410=**B**: API stateless en Docker + broker
fino en el host. Todo lo operativo (puertos, runbooks, cutover) vive en
`deploy/README.md` y en el wiki `~/workspaces/exohuman/wiki/{ui-api-split,runner,cicd}.md`;
esta nota guarda las decisiones de **código** y las trampas.

## Roles (`proxy.ts`, `lib/runner-auth.ts`)

- `PI_WEB_ROLE=web`: contenedor UI — `/api/*` responde 404 aquí (caddy lo enruta
  a la api). Nunca sirvas API desde el contenedor web: no tiene host.
- `PI_WEB_ROLE=runner`: servicio host — UI 404 y **todo** request exige
  `X-Runner-Token` (timing-safe vs `PI_WEB_RUNNER_TOKEN`). El proxy
  (`deploy/api-proxy/server.mjs`) **borra** cualquier `x-runner-token` que llegue
  del navegador antes de inyectar el suyo: el token es credencial del contenedor.
- Sin rol = app completa (dev, prod/pre systemd): comportamiento intacto.
- El api-proxy **preserva el Host original** (los checks de `request-security`
  y `PI_WEB_ALLOWED_HOSTS` se evalúan en el runner con el Host del navegador).
  `fetch` no puede fijar Host (forbidden header) — el self-test usa `http.request`.

## Streaming (SSE) — donde se rompe silenciosamente

- api-proxy: `server.requestTimeout = 0` (el default 300 s de Node mata SSE
  largo); bodies piped sin buffering; abort del cliente → destroy del upstream
  (vigila `res.on("close")` + `writableEnded`, **no** `req.on("close")`, que
  también dispara al completar normal).
- Caddy: `flush_interval -1` y `encode` SOLO en el handle de UI — comprimir
  event-stream añade latencia por chunk.
- El runner standalone hereda `proxyClientMaxBodySize: 128mb` del build.

## Imagen y runner

- UNA imagen full (`Dockerfile`, `output: standalone` por defecto vía
  `PI_WEB_BUILD_STANDALONE != 0`) sirve web-container **y** runner host; la api
  es otra imagen mínima (`deploy/api-proxy/Dockerfile`, sin build).
- El runner extrae `/app` + `/usr/local/bin/node` de la imagen (`deploy.sh
  runner`): el `pi-node` del release garantiza el ABI de `node-pty` (prebuilds
  linux-x64; sin apt en ninguna imagen). Release = `releases/<tag>` + symlink
  `current`, 3 retenidos, switch atómico + `systemctl --user restart`.
- npm ci en build necesita `bin/` copiado ANTES (postinstall
  `prepare-terminal.js`); egress solo por proxy → `--network host` + build-args.

## Firewall host (`/etc/nftables.conf`, tabla `inet exohuman`)

Policy drop en input/forward/output mataba TODO el bridge Docker (los chains de
Docker viven en tablas `ip *`, pero la tabla `inet` engancha igual y su drop es
final). Reglas aditivas: input `iifname docker0/br-*` + `dport 30152`; forward
established/egress/`ct status dnat`/inter-container; output `172.16.0.0/12`
antes del drop de rangos privados. Tras editar: `nft -c -f` y restart de
nftables **y** docker (el `flush ruleset` borra las tablas dinámicas de Docker).

## Gotchas verificados en QA (2026-10-21)

- `/api/terminal` abre PTYs sólo en raíces con sesiones (`getAllowedFileRoots`):
  un cwd sin historial da 403 "Access denied" — es el contrato, no un bug.
- `/api/agent/running` lista streams activos: una sesión `ensure_session` viva
  pero idle no aparece (se comprueba por su SSE `connected`).
- `docker cp` preserva uid del contenedor (root para binarios): chown del
  release antes de moverlo a `~/workspaces/exohuman/runner`.
- Deploy sobre el propio stack: el guard de puerto distingue listener propio
  (compose ps) de un servicio legacy ajeno (30141/30149 → `FORCE_CUTOVER=1`).

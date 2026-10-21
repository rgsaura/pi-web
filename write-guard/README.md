# write-guard — guarda de escritura real para ROT

Origen: **enc-59c26f58** (2026-10-21) · Despliegue canónico:
`~/.pi/agent/extensions/write-guard/index.ts` (código) ·
`~/.config/exohuman/write-guard.json` (config) ·
`~/.local/state/write-guard/log.jsonl` (auditoría).
Este directorio es el artefacto versionado (fork del encargo); el despliegue se hace por ruta absoluta.

## Qué hace

Extensión de pi que intercepta las herramientas `edit`, `write` y `bash` (y
`powershell` con fail-safe) en sesiones **assistant/ROT** y valida cada destino
contra una allowlist de zonas:

| Zona | Origen |
|---|---|
| `~/.local/state/**`, `~/.cache/**`, `~/.npm/**`, `/tmp/**`, `/var/tmp/**`, `/dev/shm/**` | por defecto (estado, cachés, temporal) |
| worktree `wt-<hex8>` asignado por enrutado | `routing.json` (`worktreesRoot`) + `worktrees.json` (registro; huérfanos → warn en log) |
| zonas y rutas extra | `write-guard.json` (`zones`, `paths`) — mecanismo de "config explícito del encargo" |

Fuera de zona: **bloquea** (el motivo llega al modelo en el resultado de la
herramienta), **registra** en `log.jsonl` y **avisa a Rodrigo por ROT**
(skill `personal-notifications`; clave diaria por destino → dedup del broker).
Nunca silencioso: si la notificación falla, quedan bloqueo + log.

## Activación (por qué no afecta a otras sesiones)

La extensión carga en todo proceso pi, pero sólo **actúa** cuando la sesión es
assistant/ROT: `PI_PROFILE=assistant` (puente `rot-bridge.mjs`, reconciliador,
call-intake) **o** cwd bajo `~/.local/state/routines/rot/**` (hogar del puente).
Los encargos despachados (worktrees, perfiles de brief), sesiones dev y rutinas
con otros perfiles no la activan.

## Análisis de bash

- Tokenizer propio (comillas, `$()`/backticks con recursión, heredocs, fd-dup
  `2>&1`) + tabla de comandos que escriben: redirecciones `>`/`>>`/`&>`,
  `rm/mv/cp/rsync/install/tee/dd/truncate/touch/mkdir/sed -i/perl -i/ln/
  chmod/chown/find -delete/awk print>/git/npm/pip/curl -o/wget -O/sqlite3/
  crontab/xargs/for-do`, wrappers `sudo/timeout/env…`.
- Destinos irresolubles (variables sin expandir) en comandos de escritura o
  destructivos → **bloqueo fail-safe** (p.ej. `for f in ~/x/*; do rm $f; done`).
- Código embebido `python -c`/`node -e`: si hay patrones de escritura, exige
  rutas absolutas extraíbles y dentro de zona; si no hay rutas verificables →
  bloqueo.
- PowerShell: fuera del analizador; cmdlets de escritura → bloqueo fail-safe.

## Límites conocidos (honestos)

- Los **CLIs instalados** (`rg-*`, `exo-note`, `pi`, `bun`, `node script.js`…)
  son piezas de confianza del sistema: la guarda valida destinos explícitos de
  las herramientas, no puede rastrear lo que un binario escribe internamente.
  Es el mismo principio de "piezas de confianza" del skill system-creation.
- `xargs rm < lista` sin argumentos inline: destinos desconocidos → permitido
  (documentado; el caso con args inline sí se analiza).
- Análisis estático best-effort: la garantía dura son `edit`/`write` y los
  patrones bash cubiertos.

## Config (`~/.config/exohuman/write-guard.json`)

```json
{
  "enabled": true,
  "zones": ["/ruta/extra"],
  "paths": ["~/.local/bin/routines/pieza.py"],
  "notify": true,
  "rotHome": "~/.local/state/routines/rot"
}
```

- `enabled:false` o `PI_WRITE_GUARD_DISABLE=1` (env del proceso pi, fijado por
  quien lanza): kill-switch **fuera del alcance del modelo** — la config y la
  propia extensión viven fuera de las zonas, así que ROT no puede desactivarse
  la guarda escribiéndolas.
- `PI_WRITE_GUARD_CONFIG` / `PI_WRITE_GUARD_LOG`: overrides de prueba.

## Operación

- `/write-guard` en cualquier sesión pi: estado, zonas y últimos eventos.
- Log: una línea JSONL por init/bloqueo/escritura permitida/warn/error de notificación.
- Aviso ROT: source `write-guard`, un notice por (tool, destino, motivo) y día.

## Verificación (enc-59c26f58)

- `self-test.mjs` (bun): tabla de casos unidad gate + analizador + herramientas.
- `probe-e2e.sh`: sesión pi real en modo ROT con intentos dentro/fuera + sesión
  no-ROT de control (ver README del encargo / `rg-encargo done`).

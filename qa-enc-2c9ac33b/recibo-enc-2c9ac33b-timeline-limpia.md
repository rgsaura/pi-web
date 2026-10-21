# Recibo — enc-2c9ac33b: reparación de errores/timeouts que ensuciaban la timeline (2026-10-21)

Pedido por Rodrigo 21-10 ~22:40 (422 eventos en failure-ledger). Ejecutado desde el worktree `wt-2c9ac33b` (rama `fork/2c9ac33b`); piezas del host editadas por ruta absoluta vía terminal del runner (`/api/terminal`, mismo canal que la UI).

## Diagnóstico por clase

| Clase | Causa raíz | Reparación |
|---|---|---|
| (1) tg-api "Bad Gateway" (42) + poll-loop + audio-intake — ráfaga 22:22-22:36 | Tormenta transitoria de la API de Telegram (502 reales en JSON; la VM llega directo a api.telegram.org, verificado 302 OK directo y vía proxy tailscale). Cada reintento (poll cada ~17 s) escribía una línea permanente al ledger. Agravado: getMe de arranque falló a las 22:31 ("Bot ID invalido") → proceso muerto → puente caído ~8 min. | `rot-bridge.mjs`: dedup 15 min por kind en `recordFailure` + `getMe` con 10 reintentos×30 s en el arranque. Backup: `rot-bridge.mjs.bak-enc2c9ac33b-20261021225917`. |
| (2) pi-timeout(40)/pi-empty(45)/pi-exit-1(11)/drop-exhausted(4)/unrecovered(11) | Histórico del 15-19 oct (incidente documentado en el propio ledger: gateway lento, sesiones gigantes); ya mitigado por presupuestos adaptativos, cap 512 KB y perfiles. Hoy: pi-timeout 1, drop-exhausted 1 (update 573101025 escalado al reconciliador y entregado: rot-pending/rot-requeue vacíos a las 22:53). | Sin regresión activa; el dedup evita que un incidente futuro inunde la timeline. Vigilancia: la propia timeline (watch-gateway avisa si LiteLLM decae). |
| (3) rg-watch-wallapop.service — 46 fallos/día | Sesión VibeSurf de wallapop muerta desde el 15-10: `ERR:no-cookie` ×282 consecutivos. El watcher NO puede funcionar sin relogin manual; el guard de expiración ya había parado los timers (21-10 10:57). | RETIRADA (reversible): services+timers movidos a `~/.config/systemd/user/retired-enc2c9ac33b/` con README de restauración; `routines.json` marca `retired` en `watch-wallapop` y `wallapop-watch`. |
| (4a) Unidades legacy failed (exohuman-ui / -pre) | Falló de estado al pararse en la migración Docker (21-10 16:52); prod/pre sirven por Docker+caddy (:30141/:30149 verificado HTTP 200), las units systemd sólo ensuciaban. | RETIRADAS al mismo directorio `retired-enc2c9ac33b/` + `daemon-reload`. |
| (4b) gpg-agent scdaemon — 1953 líneas/día | La VM no tiene tarjeta inteligente ni claves gpg; gpg-agent intentaba arrancar scdaemon en cada operación (~1/min) y fallaba con "IPC connect call failed". | `~/.gnupg/gpg-agent.conf` → `disable-scdaemon` (con cabecera de origen); agente reiniciado (PID nuevo 459504). Journal: 0 líneas scdaemon desde el reinicio (23:16 UTC). |
| (5) session-rotate (63) benigno | Rotar contexto de ROT es operación normal (cap 512 KB, recuperación), no un fallo. | Fuente: `rotateSession()` ya no escribe al ledger (sólo log del servicio). Timeline: `mapFailureLines` filtra `session-rotate`/`recovered`/`lesson` del histórico. |

## Cambios en piezas (host)

- `~/.local/bin/routines/rot-bridge.mjs` — 3 parches quirúrgicos (dedup, session-rotate, getMe-retry). `node --check` OK; servicio reiniciado 23:04 UTC; heartbeat vivo; **dedup verificado en vivo** (gateway lento 23:12→23:18 produjo 1 sola línea en vez de ~6).
- `~/.config/systemd/user/retired-enc2c9ac33b/` — 6 units retiradas + README.
- `~/.config/exohuman/routines.json` — 2 rutinas wallapop `retired: true`.
- `~/.gnupg/gpg-agent.conf` — nuevo, `disable-scdaemon`.

## Cambios en el repo (fork/2c9ac33b, pendiente de merge con OK)

- `lib/timeline-data.ts`: `mapFailureLines()` — filtra kinds benignos y colapsa ráfagas ≤15 min en un evento "×N (M min)".
- `app/api/timeline/route.ts`: `readFailures` lee 400 líneas y usa `mapFailureLines`.
- `lib/timeline-data.test.mjs`: 4 tests nuevos (10/10 pasan). tsc y lint limpios.
- Dry-run contra el ledger real: 426 líneas → 109 eventos; la ráfaga de hoy = "tg-api: Bad Gateway ×33 (9 min)".

## Verificación final (23:18 UTC)

- `systemctl --user list-units --state=failed` → **0 unidades failed** (antes: 4).
- Journal scdaemon: 0 líneas nuevas desde 23:16.
- rot-assistant: active, heartbeat al segundo, sin errores en journal.
- Timers systemd: sin ningún timer wallapop; el resto (watchdog, calendar, pre-watch…) intactos.

## Objetivo 24 h sin ráfagas

El dedup en fuente + colapso en vista garantizan que una tormenta futura = 1 línea/1 evento. `watch-gateway` sigue avisando (1 línea por ventana) si LiteLLM decae; `critical` siempre escribe. Revisar la timeline mañana: los días futuros deben mostrar ≤1-2 fallos/evento por incidente real.

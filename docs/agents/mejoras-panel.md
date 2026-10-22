# Panel «Mejoras del Sistema» — generador (bin/mejoras-panel.mjs)

Panel de paneles-ecosistema (enc-bee02de7): dashboard con datos 100% reales de
los ledgers y git que muestra qué se ha hecho y qué está en marcha. El generador
vive en el repo; el panel generado vive en el catálogo canónico
(`PANELES_ROOT`, `~/.local/share/exohuman/paneles`) y lo sirve ExoHuman UI en
`/api/paneles/<slug>` (módulo paneles, rama `fork/paneles*`; producción lo
sirve tras su próxima promoción).

## Qué colecciona (fuentes reales, sin mockups)

- **Encargos** — `~/.local/state/encargos/ledger.json`: completados en la
  ventana de 7 días (`resuelto`), con `titulo` + `nota` (el resumen de
  `rg-encargo done`) y enlace a la sesión (`/?session=<id>`, regla 21); y los
  pendientes como «En marcha». El id es la clave del mapa (los valores no
  llevan `id`).
- **Propuestas resueltas** — `~/.local/state/proposals/ledger.json`:
  `status=resolved` + `resolution.resolved_at` en ventana;
  `resolutionLabel()` muestra la opción exacta o trunca el texto libre a 140.
- **Reglas grabadas** — `~/.pi/agent/AGENTS.md`: reglas numeradas de nivel
  superior cuya cabecera cita «grabado … <fecha>» (la convención 18/21/22/24/25/26).
  Ventana 7 días; si no hay novedades, muestra las últimas 3 marcado `fallback`.
- **Commits por rama/worktree** — repo `~/workspaces/exohuman-ui`:
  `worktree list --porcelain` + `for-each-ref` + `git log <branch> --since`
  por rama (sin merges, `--date=iso-strict`), anotadas con el registro
  `~/.local/state/exohuman/worktrees.json` (encargo/puerto por worktree) y
  `merge-base --is-ancestor <branch> main` («en main» = promocionado,
  «fork» = sin fusionar). `exec` es inyectable: los tests prueban el parsing
  con salidas falsas.
- **Sesiones activas** — captura en generación vía `GET /api/agent/running` +
  `GET /api/sessions` de producción loopback (`:30141`), y refresco en vivo
  desde el navegador (fetch same-origin cada 30 s).

## Sesiones: directo vs captura (trampa conocida)

El HTML del panel corre same-origin dentro de ExoHuman UI (iframe del visor de
paneles). El directo sólo puede leer la API de **la instancia que lo sirve**:
producción rechaza lecturas cross-origin (403). Regla del cliente (`refresh()`):

1. same-origin reporta sesiones → directo (badge LIVE).
2. same-origin no reporta (pre hoy: las sesiones viven en producción) → se
   mantiene la **captura real de la generación** con nota explícita; servido
   desde producción el panel pasa a directo solo.
3. fallo de API → captura con nota.

`refresh()` devuelve su promesa (necesario para los tests; en producción corre
igual con `setInterval`).

## Contrato del panel generado

- Directorio `<AAAA-MM-DD>-mejoras-sistema/` (slug estable: la primera fecha;
  reejecutar actualiza `index.html` + `data.json` en el mismo directorio y
  **preserva** `panel.json` — incluidos los enlaces `sessions` de `rg-panel
  link`).
- `panel.json`: `fijar: "candidato"`, `regla: 29`, `estado: "activo"` — el
  registro en el catálogo como candidato a fijar que pide el encargo.
- `index.html` autocontenido (sin dependencias, tema oscuro de la casa,
  safe-areas iOS, `<details>` nativos para desplegar); `data.json` con los
  datos crudos y las rutas de las fuentes.
- El JSON embebido para el cliente se incrusta con `escapeJsonForScript()`
  (`<`, `>`, `&`, U+2028/2029) para romper `</script>` y saltos de línea.
- Enlaces a sesión siempre root-relative `/?session=<id>` con `target="_top"`
  (resuelven al origen que sirva el panel, iframe incluido).

## Regenerar

```bash
node bin/mejoras-panel.mjs            # actualiza el panel del catálogo
node bin/mejoras-panel.mjs --dry --json   # sin escribir, datos por stdout
```

Idempotente y pensado para rutina o para el gestor de paneles (enc-6d8067e1).
Tests: `node --test bin/mejoras-panel.test.mjs` (incluidos en `npm test`;
cubren también el script cliente extraído del HTML con DOM/fetch stubbados).

Files: `bin/mejoras-panel.mjs`, `bin/mejoras-panel.test.mjs`,
`~/.local/share/exohuman/paneles/<fecha>-mejoras-sistema/` (generado),
`~/.local/bin/rg-panel` (catálogo).

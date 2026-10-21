# Informe QA visual ExoHuman UI — enc-919a3f1e

**Fecha:** 21-10-2026 · **Modo:** usuario real, Chrome headless (Playwright) + análisis de CADA captura con visión (mimo-v2.6-pro vía gateway litellm CT126) + audit mecánico de layout (DOM).

## Cobertura

- **78 capturas**: prod (:30141) + pre (:30149) × {móvil 390, tablet 820, desktop 1440} × {claro, oscuro} × vistas {home, session, session-scrolled, timeline, proposals, post-studio, encargos, paneles, agents, activity, sidebar-open}.
- 0 errores de consola/pageerror capturados (`captures/console-errors.json`).
- 333 fricciones catalogadas en 318 grupos → `findings/catalogo-fricciones.md` (cada una con captura y descripción).
- Verificación mecánica adicional: overflow horizontal, elementos fuera del viewport, targets táctiles (`audit-layout.json`, `probe-elementos.mjs`).

## Top-5 corregidas en el fork (rama `fork/qa-visual-919a3f1e`)

| # | Ficción (evidencia) | Fix | Verificación post-fix |
|---|---|---|---|
| 1 | **Proposals móvil: fila de filtros fuera del viewport** (barra de 470px en 390px, select 'Por urgencia…' right:581; audit pre + visión ×4 combos) | Wrap de la fila y del grupo de filtros (`ExoProposalsView.tsx`); tabs con minHeight 40 en móvil | audit dev: **offscreen 0, overflowX 0**; visión post-fix: patrón desaparecido |
| 2 | **Encargos móvil: botones 'Actualizar/Cerrar' desbordando** (right:397 > 390; audit + visión) | Header con `flexWrap` + `rowGap`, bloque izquierdo `minWidth: 0` (`EncargosView.tsx`) | audit dev: **0 offscreen**; visión post-fix: 0 restantes |
| 3 | **Targets táctiles de 26-29px en toda la navegación móvil** (chips Timeline/Paneles/Post Studio/Agentes, Cronológico/Proyectos, Todo/En Vivo/Encargos/Rutinas; audit: 10+ por vista; visión ×25) | `secondaryPillStyle(isMobile)` 40px (`SessionSidebar.tsx`); view-mode y quick-chips 40px (`SessionsExplorer.tsx`); iconos attach/voz/envío del composer 32→40px móvil (`ChatInput.tsx`) | DOM dev: chips 40px, Attach/Send/Voz **40×40** medidos |
| 4 | **Selector de modelo truncado 'Failover Normal (Defa…'** (visión ×10 combos prod+pre) | Quitar sufijo '(Default)' del label del botón + `title` con nombre completo (`ModelSelector.tsx`); dropdown conserva nombre íntegro | DOM dev desktop: **'Failover Normal' completo, no truncado**, title='Failover Normal (Default)' |
| 5 | **Timeline: títulos/detalles largos volcados sin límite** (párrafos ~10 líneas; visión ×3+) | `line-clamp` 3 líneas en título y 2 en detalle, con `title` completo (`TimelineView.tsx`) | DOM dev: **741 títulos clamp-3 + 741 detalles clamp-2** aplicados |

**Verificación global post-fix (dev :30145, mismo pipeline):** 20 capturas re-analizadas con visión, `tsc --noEmit` limpio (EXIT=0), audit: overflowX=0 y offscreen=0 en todas las vistas×viewports.

## Fricciones documentadas, fuera del top-5 (pendientes de criterio)

1. **PROD desfasado**: `?view=paneles` y `?view=post-studio` NO renderizan la vista en :30141 (muestran sesión); en pre/main sí funcionan. **Acción: deploy de prod** (no es código, los árboles prod son intocables por encargo).
2. **Contraste en tema claro** (~43 hallazgos: iconos/grises lavados, 'Session info', flecha de envío) — patrón transversal, merece pasada propia.
3. **Chips de origen en proposals parten fechas** ('20-'/'10') y **'Ver sesión en vivo' se parte en dos líneas** — fila Origen muy apretada en móvil.
4. **Nombres truncados en sidebar/FILES** ('Proyecto: wt-paneles-ma…', breadcrumbs) — sin tooltip/expansión; molesta con worktrees de nombre largo.
5. **Iconos 'Acciones de…' de las filas de sesión** (28px, tertiary, ≥24px AA) — aceptables pero mejorables.
6. Filas de chips con scroll horizontal (quick-chips del sidebar, categorías de proposals): cortan el último chip en el pliegue **por diseño** (scrollables), pero sin affordance visual — candidato a fade/indicador.

## Artefactos

- Capturas: `qa-enc-919a3f1e/captures/{prod,pre,dev}/<combo>/<vista>.png` (locales, fuera del commit por peso).
- Catálogo: `qa-enc-919a3f1e/findings/catalogo-fricciones.md` + `findings/top-5-fixes.md`.
- Análisis por captura: `qa-enc-919a3f1e/vision-results/**/*.json`.
- Scripts reutilizables: `capture.mjs`, `vision-qa.mjs` (reanudable), `consolidar.mjs`, `audit-layout.mjs`, `probe-elementos.mjs`.
- Dev server del fork para review: **:30145** (`fork/qa-visual-919a3f1e`).

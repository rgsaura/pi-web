# Informe QA visual móvil COMPLETO — ExoHuman UI (enc-9d1a903c)

**Fecha:** 21-10-2026 · **Objetivo:** pre (:30149) · **Modo:** usuario real — capturas iPhone (390×844, táctil) claro/oscuro de TODAS las vistas del shell + nivel 2, CADA captura analizada con modelo de visión (mimo-v2.6-pro) + audit mecánico de DOM (overflow/offscreen/targets táctiles ≥44px) + probes DOM de verificación de cada hallazgo sospechoso.

## Cobertura

- **42 capturas de pre** (18 vistas × móvil oscuro/claro + 6 desktop sanity) + **42 post-fix del fork** (:30154) — **84 analizadas con visión**, 0 errores de consola/pageerror.
- Vistas: home, session, session-scrolled, sidebar-open, sidebar-proyectos, sidebar-envivo, timeline, timeline-patrones, proposals (Decisiones), encargos, activity, workspaces, paneles, panel-detail, agents (Inspector), post-studio, post-detail, settings-open.
- Audit mecánico: 11 vistas × {móvil, tablet, desktop} × {pre, fork} = 66 audits (overflowX, offscreen, targets <44/<30px).
- Safe-areas Safari: auditadas en código — `viewportFit: "cover"` + `env(safe-area-inset-*)` presentes (composer, login, terminal keys); los insets no se renderizan en headless y se verificaron por código.
- **Nota de entorno:** el rasterizador headless no pinta emojis en color (fuente no soportada) → las cajas "tofu" de las capturas son artefacto del entorno, NO bug de producto (verificado: en iOS real renderizan). Filtradas de los hallazgos.
- **Nota de base:** pre (:30149) sirve un build de la rama `dev` (SystemSections, gestor de paneles, workspaces — verificado contra el DOM servido). Los fixes se aplican sobre `fork/9d1a903c` = `dev` + correcciones.

## Corregido en `fork/9d1a903c` (verificado post-fix)

| # | Severidad | Fricción (evidencia) | Fix | Verificación |
|---|---|---|---|---|
| 1 | **Bloqueante** | **Detalle de panel desborda e ilegible en móvil**: la meta (badge `INFORM…`, fecha, resumen) se apretaba en columna de 89px y sobresalía 34px del viewport (right 424 > 390; audit ×4 spans offscreen + visión ×2) | Header con `flexWrap`/`rowGap`, h1 con elipsis + `title`, meta con `minWidth:0` (`PanelesView.tsx`) | audit: **offscreen 0**; visión post-fix: cabecera legible, sin cortes |
| 2 | Fricción alta | **Pills "Secciones del Sistema" truncadas a `P… 20`, `De… 1`, `Recie…`** en todo el sidebar móvil (grid de 4 columnas fijas → label de 22px; visión ×6 capturas, DOM medido) | Grid **2×2 en móvil** (4 columnas en desktop) + minHeight 36 (`SystemSections.tsx`) | DOM: labels completos "Proyectos 20", "Decisiones 1", "Recientes"; visión post-fix: patrón desaparecido |
| 3 | Fricción alta | **Títulos de sesión cortados en seco a 60 chars** (`…la vist`) en filas del sidebar — sin elipsis (`sessionRowTitle` → `slice(0,60)`; visión ×6) | Elipsis `…` al truncar + tooltip completo ya existente en la fila (`SessionTree.tsx`) | Visión post-fix: cortes "en seco" desaparecidos |
| 4 | Fricción media | **Fallback de títulos de encargos cortado a 60 sin elipsis** (data layer + 2 vistas; títulos largos tipo `BUG visibilidad…la vist`) | Elipsis en `exo-data.ts`, `EncargosView.tsx`, `ExoPanel.tsx` | DOM: fallback termina en `…` |
| 5 | Fricción media | **Targets táctiles <30px** generalizados (regla 27: ≥44): `Actualizar actividad` 25px, `↻` sandboxes 23px, `Guardar`/`Cerrar`/`Actualizar` 28px, chips de categoría proposals 25px, Fijar/Demanda/Archivar 28px, `Ir a sesión de trabajo` 27px, Copy de mensaje 22px, tabs de archivos escritos 24px | `.config-button-small`→36px con `@media (pointer: coarse)`; `buttonBase` con `minHeight:36` (Activity/Workspaces/Sandboxes/Proposals); chips categoría 36px móvil; segmentos de panel 36px; Copy 32px; chips de archivos 32px | **Audit móvil: tg<30 de 25→0 en las 11 vistas** (era 25 elementos por vista en pre); offscreen 0 |
| 6 | Fricción menor | **Placeholder del buscador cortado a mitad de palabra** (`Buscar sesiones, encar`) en el drawer (visión ×5) | Placeholder `Buscar…` (aria-label completo intacto) | Captura post-fix: placeholder entero |

**Verificación global post-fix (:30154, fork):** `tsc --noEmit` limpio · `npm run lint` 0 errores · 42 capturas re-analizadas con visión · audit overflowX=0, offscreen=0, tg<30=0 en las 11 vistas × móvil.

## Documentadas, pendientes de criterio (no corregidas)

1. **Contraste tema claro `--text-dim` (#94a3b8) = 2.45–2.56:1** — falla WCAG AA en textos secundarios (timestamps, meta, empty states). Token de diseño transversal: tocarlo cambia el equilibrio de ambos temas (medido también dark: `--text-dim` 3.73:1). Merece decisión de diseño propia.
2. **Barra superior móvil**: "Session info" cortado al borde derecho (visión ×3) — la fila de tabs no cabe a 390px y no muestra affordance de scroll.
3. **Filas de chips con scroll horizontal sin affordance** (quick-filters del explorer, categorías de proposals): cortan el último chip en el pliegue por diseño; candidato a fade/indicador.
4. **Avatares con letra solapando texto adyacente** (opciones de propuestas, contenido embebido de paneles) — patrón visual menor.
5. **Grupos "Rutinas · xxx" con truncado `clip`** (sin elipsis) y tooltip sólo hover (en móvil no existe hover).
6. **Encargos**: badges de tarjeta envuelven a 2 líneas apiñados ("EN CURSO", "Dificultad: Media", IDs monoespaciados); contador "1 activos" + "228 total" frente a la lista paginada visible.
7. **Timeline › Patrones por hora**: estado vacío correcto (ledger retro vacío, 0 eventos) pero no enlaza con la entrada rápida 🕰️.
8. **Timeline**: tabs Eventos/Patrones a 30px y filtros de tipo a 30px (≥30, bajo el estándar de 44 pero usables).
9. Falsos positivos descartados con probes (quedan documentados en `vision-results/`): home "vacía" (es el hub de nueva sesión), botón "Enviar respuesta" apagado (está disabled de verdad), fila cortada por "FIJADOS" (scroll normal de lista virtualizada), empty-state de "En Vivo" (existe: "Nada que coincida con el filtro").

## Artefactos

- Scripts reutilizables: `capture.mjs`, `vision-qa.mjs` (reanudable), `audit-layout.mjs`, `consolidar.mjs`, `probe-hallazgos.mjs`, `evidencia.mjs`.
- Resultados: `vision-results/{pre,localhost_30154}/**.json` (por captura), `audit-layout-{pre,localhost_30154}.json`, `consolidado.json`.
- Capturas: `captures/{pre,localhost_30154}/<combo>/<vista>.png` (locales, fuera del commit por peso).
- Evidencia antes/después por elemento: `evidence/{antes,despues}-*.png`.
- Informe publicado como panel: `?view=paneles&panel=2026-10-21-qa-visual-movil-completo`.
- Review del fork con fixes: **dev server :30154** (`fork/9d1a903c`, base `dev`).

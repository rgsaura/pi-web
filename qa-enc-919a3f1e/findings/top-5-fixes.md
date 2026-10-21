# Top-5 fricciones a corregir (evidencia: capturas + visión + audit mecánico)

Criterio: real, reproducible, código en main (pre), impacto en uso móvil/desktop diario.
Excluidos: tofu/emojis ▯ (artefacto de fuentes del Chrome headless, no ocurre en dispositivo real),
`?view=paneles|post-studio` en prod (deploy desfasado: pre/main sí lo tienen → acción de deploy para Rodrigo, no código).

1. **[bloqueante-móvil] Proposals: fila de filtros desborda el viewport** — la fila `🎯 Pendientes | 📋 Todas | ⏰ Por urgencia…` mide ~470px en un viewport de 390px; el select de orden queda fuera de pantalla (right: 542-581px). Sin scroll horizontal visible.
   Evidencia: `audit-layout.json` (pre/mobile/proposals: 3 offscreen), visión en 4/4 combos móviles (prod+pre).
2. **[bloqueante-móvil] Encargos: botones 'Actualizar/Cerrar' desbordan el borde derecho** (right: 397 > 390) — media etiqueta fuera de pantalla.
   Evidencia: `audit-layout.json` (pre/mobile/encargos), visión mobile-dark.
3. **[fricción sistémica móvil] Chips de navegación con target táctil de 26-29px** — toda la fila secundaria del sidebar (Timeline, Paneles, Post Studio, Agentes; Cronológico/Proyectos; Todo/En Vivo/Encargos/Rutinas) mide 26-29px de alto, lejos del mínimo 44px táctil. Presente en TODAS las vistas móviles (audit: 10+ elementos por vista).
   Evidencia: `audit-layout.json` smallTargets sistemático; visión 'target táctil' ×25.
4. **[fricción universal] Selector de modelo truncado: 'Failover Normal (Defa…'** — el label del modelo activo en el composer se corta justo en '(Defa…' en 10/12 combos (prod+pre, móvil/tablet/desktop): no se sabe qué modelo está activo.
   Evidencia: visión ×10 combos en home/session.
5. **[fricción] Timeline: descripciones de eventos largas sin límite** — párrafos de ~10 líneas volcados enteros en la lista (p.ej. evento 'caduca: Exploración de planes…'), rompen el escaneo del timeline.
   Evidencia: visión ×3 (prod+pre desktop-dark/light); patrón 'descripción completa sin clamp'.

## Plan de verificación post-fix
- `tsc --noEmit` limpio.
- Dev server propio en :30145 (registro), re-captura de vistas afectadas (proposals/encargos/timeline/home móvil+desktop, claro+oscuro) y re-análisis con visión + audit mecánico (overflowX=0, offscreen=0, targets≥40px).

# QA visual móvil completo — enc-9d1a903c

Objetivo: pre (:30149, build w2-6d75347 = dev) · 42 capturas iPhone claro/oscuro de 18 vistas
+ 6 desktop, CADA una analizada con visión (mimo-v2.6-pro) + 66 audits mecánicos de DOM +
probes de verificación. 6 correcciones aplicadas en este fork. Informe: INFORME-QA.md.

- Las capturas completas (PNG a 2x, ~20 MB) quedan fuera del commit: `captures/` se
  regenera con `node capture.mjs [pre|<url>]`. La evidencia clave está en `evidence/`
  (capturas de elemento antes/después) y publicada como panel:
  `2026-10-21-qa-visual-movil-completo` (PANELES_ROOT=~/.local/state/exohuman/paneles,
  servido por el dev server de este fork en :30154).
- Scripts reutilizables para el próximo QA: capture.mjs (matriz móvil completa + flujos
  interactivos), vision-qa.mjs (reanudable), audit-layout.mjs (overflow/offscreen/targets
  <44 y <30), consolidar.mjs, probe-hallazgos.mjs, evidencia.mjs.
- Nota de entorno: sin fuente de emoji en el rasterizador headless → las capturas muestran
  cajas tofu donde iOS renderiza emojis (artefacto, no bug; documentado en el informe).

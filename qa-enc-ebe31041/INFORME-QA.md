# QA visual — enc-ebe31041 (Post Studio v2)

Capturas: `capture.mjs` (playwright, tema vía `localStorage.pi-theme`, vista
`?view=post-studio&post=herradura-2026`, 2 viewports × 2 temas × 4 secciones,
errores JS: 0). Análisis: `vision.mjs` (gateway litellm, mimo-v2.6-pro, con
ProxyAgent 127.0.0.1:1056). Resultados: `vision-results.json`. PNGs sin
commitear (convención del repo).

## Resultado tras fixes

- **Bloqueantes: 0 · Fricción: 6 (menores) · Cosméticas: 18**
- Primera pasada (pre-fix): 33 fricciones. Fixes aplicados: elipsis en la
  línea de procedencia de cada slide, contraste del texto de avisos de
  validación (#d97706→#b45309), tooltip del título truncado.
- Las 6 fricciones restantes son móviles y menores: 3 son artefactos de
  scroll de la captura (tarjeta cortada junto a la barra fija — el contenedor
  ya tiene paddingBottom 150px+safe-area), placeholder del buscador cortado
  (los placeholder no elipsan), procedencia truncada a 390px (tooltip con el
  texto completo) y wrap del chip «✓ encaja» inline.
- Emoji tofu en las capturas = Chromium headless sin fuentes emoji (artefacto
  del entorno de QA, no de la app).
- Los dots del preview (12 máx + «+N») son diseño intencional tipo IG.

## Verificación funcional (build de producción :30146)

- Música IG real: búsqueda viva (biblioteca real: Bad Bunny, Rawayana, Serrat…),
  preview m4a 230 s desde CDN de IG, pista añadida + elegida
  (audioId 827599563588935 «Se Vienen Cositas», Rawayana), alternativa
  «Otro Atardecer» disponible.
- Validación visual: 4 pasadas; la 1.ª cazó el vídeo "despedida" de Sergio
  (era un interior de oficina/auditorio) y la procesión (Semana Santa en
  ciudad) → curación → 15/15 fit, status ok (zai-glm-flash).
- Gates: decide bloqueado sin validación fresca ni revisión completa
  (REVIEW_PENDING / VALIDATION_*), música generada no publicable.

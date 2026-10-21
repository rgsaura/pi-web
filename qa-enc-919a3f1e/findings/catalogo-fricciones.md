# Catálogo de fricciones — QA visual ExoHuman UI (enc-919a3f1e)

Fuente: 78 capturas Chrome headless (prod :30141 + pre :30149) × {móvil 390, tablet 820, desktop 1440} × {claro, oscuro},
analizadas cada una con visión (mimo-v2.6-pro vía gateway litellm). `captures/<server>/<combo>/<vista>.png` → `vision-results/...json`.

## pre/desktop-dark/activity
Vista Activity en tema oscuro con sidebar de navegación + árbol de archivos a la izquierda y panel principal con canales principales, presupuesto de tokens, buscador/filtros y lista de sesiones pi activas.

- **[friccion]** tarjeta FaceSearch (canales principales, centro-arriba) — El nombre del servicio 'rg-facesearch-sentinel....' y el id de sesión 'faceear...' aparecen truncados con puntos suspensivos; no se puede identificar el servicio ni la sesión.
- **[friccion]** tarjeta ROT (canales principales, centro-arriba) — El enlace de sesión activa se muestra truncado como 'rot-tel..', cortando el nombre de la sesión antes de 'Abrir sesión →'.
- **[cosmetica]** varias zonas (Cuota de Tokens, Renovación de ciclo, input Buscar, nombres de Proyecto, chips de filtro UI/FaceSearch/Comms/Rutinas/Planes, opción 'Mayor CPU') — Los iconos/emoji se renderizan como cajas vacías (glifo faltante/tofu), lo que ensucia la interfaz y da sensación de rotura.
- **[cosmetica]** tarjeta Voz (canales principales, centro) — A diferencia de ROT y FaceSearch, la tarjeta Voz no muestra fila 'Sesión activa: ... Abrir sesión →', dejando un hueco vacío y una inconsistencia de información entre tarjetas.

## pre/desktop-dark/agents
Vista Agents con sidebar izquierdo (navegación, workspace, árbol de archivos) y panel principal con 3 tarjetas de agentes colapsables más un 'Catálogo de skills (80)', con mucho espacio vacío debajo.

- **[cosmetica]** panel principal, zona inferior (bajo 'Catálogo de skills (80)') — Gran área vacía (~400px) sin contenido ni mensaje; el 'Catálogo de skills (80)' aparece como cabecera colapsada sin pistas de que hay 80 items dentro, lo que hace parecer la vista incompleta.
- **[cosmetica]** sidebar izquierdo, item 'Línea de tiempo' — El texto del label se parte en dos líneas ('Línea de' / 'tiempo') rompiendo la altura y alineación de los items de navegación respecto al resto.
- **[cosmetica]** tarjetas de agentes (dev, exohuman-ui, rot), esquina superior derecha — El chevron de colapsar está muy alejado del título/badges, pegado al borde derecho de la tarjeta, lo que dificulta asociarlo con el agente y desperdicia ancho.

## pre/desktop-dark/encargos
Vista de Encargos y Objetivos en tema oscuro: barra superior de herramientas, sidebar izquierdo con navegación (Actividad, Línea de tiempo, Paneles, Encargos, Decisiones, etc.), árbol de FILES y Settings; panel principal con filtros (En curso/Activos, Todos, Completados), selector de Area y 4 tarjetas de encargos activos con badges de estado/dificultad, descripción y botón 'Ir a sesión de trabajo'.

- **[friccion]** 3 tarjetas (Post Studio v2, Gestor de paneles, Mejora recursiva) — línea de descripción — Las tres muestran el mismo texto genérico 'Iniciando investigación...' pese a llevar 8-12 min activas; el estado no informa de progreso real y parece placeholder estancado.
- **[cosmetica]** Sidebar izquierdo — item 'Línea de tiempo' — El label se parte en dos líneas ('Línea de / tiempo') mientras el resto de items está en una, rompiendo la alineación y la altura uniforme de la lista de navegación.
- **[cosmetica]** Tarjetas — metadatos superiores derechos ('Llevan 8m enc-6d8067e1') — Duración e id concatenados sin separación clara en gris de bajo contraste sobre fondo oscuro; el id apenas se distingue y la info queda poco legible.

## pre/desktop-dark/home
Vista home en tema oscuro: topbar con tabs de sesión y panel de estado a la derecha; sidebar izquierdo con navegación de módulos, árbol de sesiones/workspaces (sin sesiones) y explorador de FILES; centro con hero 'Exohuman UI', breadcrumbs, composer de nueva sesión con input y fila de controles/config bajo el campo.

- **[friccion]** Sidebar izquierdo, sección FILES: chips de breadcrumb de carpetas (fila '.xohuman-ui | .udio-v2 12') — Los nombres de las carpetas están truncados sin elipsis coherente: aparece '.xohuman-ui' (faltan letras del inicio) y '.udio-v2' (debería ser 'post-studio-v2'), el usuario no puede identificar el workspace/fork seleccionado.
- **[cosmetica]** Sidebar izquierdo, bloque de navegación: item 'Línea de tiempo' — El label 'Línea de tiempo' envuelve a dos líneas y hace que ese item sea más alto que el resto de la navegación ('Actividad', 'Paneles', 'Post Studio'...), rompiendo el ritmo vertical de la lista.
- **[cosmetica]** Sidebar izquierdo, item 'exohuman-ui' bajo el árbol de sesiones — Estado vacío 'No sessions yet' como único texto gris pequeño, sin icono ni acción para crear una primera sesión; además el texto está en inglés mientras el resto del UI está en español.
- **[cosmetica]** Centro, composer: placeholder del textarea 'Message... Type / for commands, @ for files' — Placeholder en inglés ('Message... Type / for commands') en una interfaz que por el resto está traducida al español, inconsistencia de idioma.
- **[cosmetica]** Centro, fila de controles bajo el composer (iconos adjuntar/mic + 'Failover Normal (Default)', 'auto', 'configured', 'Compact') — Los iconos de adjuntar y micrófono son muy pequeños y de bajo contraste sobre fondo oscuro, y la fila mezcla iconos sueltos con etiquetas de texto seguidas de iconos, quedando la configuración del envío poco jerarquizada y apretada.
- **[cosmetica]** Sidebar izquierdo, cabecera 'FILES': fila de iconos de acciones (>, carpeta, upload, refresh, eye, .., búsqueda) — Los iconos de acciones de la cabecera FILES son diminutos y están muy juntos, con targets poco diferenciados y sin separación clara entre acciones del árbol y de búsqueda.

## pre/desktop-dark/paneles
Vista Paneles con sidebar de navegación a la izquierda (Actividad, Línea de tiempo, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz, árbol de FILES) y, en el área principal, cabecera 'Paneles e Informes' con badge de activos, filtros (Activos/Archivados/Todos) + buscador, y una galería de tarjetas agrupadas en INFORMES (4), GALERÍAS (1) y COMPARATIVAS (2) con badges de tipo, fecha, descripción y botón 'Sesiones'.

- **[cosmetica]** Píldora del filtro 'Activos' (fila de filtros, zona superior del contenido) — Hay un pequeño elemento/glifo suelto que se solapa con la etiqueta 'Activos' en la esquina superior derecha de la píldora, rompiendo el acabado del botón seleccionado.
- **[cosmetica]** Fila de filtros + buscador 'Buscar panel...' (parte superior del área principal) — El input de búsqueda tiene mayor alto que las píldoras de filtro y sus bordes superior/inferior no alinean con los de los botones, dejando la fila desalineada verticalmente.
- **[cosmetica]** Cabecera de sección 'COMPARATIVAS 2' (entre GALERÍAS y las tarjetas naranjas) — El icono decorativo previo al rótulo se solapa ligeramente con la letra inicial de 'COMPARATIVAS', y el icono de 'GALERÍAS' presenta el mismo ajuste justo.

## pre/desktop-dark/post-studio
Vista Post Studio con sidebar izquierdo (nav, workspaces, file tree), columna central con mockup de carrusel (foto, navegación, dots) y columna derecha con narrativa A/B/C, selector musical con reproductor y lista de fotos reordenable; footer fijo con resumen y acción de confirmación.

- **[cosmetica]** columna derecha, fila de música B (Indie emotivo), línea inferior del reproductor — El texto de estado 'en pausa · 0:00 / 0:00 · loop' tiene contraste muy bajo respecto al fondo del card seleccionado, apenas legible; la barra de progreso es una línea casi imperceptible.
- **[cosmetica]** columna derecha, lista 'TUS FOTOS', fila 6 (Velas) en el borde inferior — La fila 6 queda cortada/parcialmente oculta bajo la barra fija de confirmación del footer, sin margen de respiro visible entre el final de la lista y la barra.
- **[cosmetica]** mockup central, cabecera de la historia (rgsaura · La Herradura) — El texto de usuario/título de la historia queda pegado al borde derecho del frame del mockup, con riesgo de truncado en nombres más largos.

## pre/desktop-dark/proposals
Vista Decisiones con sidebar izquierdo de navegación + panel FILES, barra superior de filtros y área principal con una propuesta (título, origen, enlaces, descripción) y la lista de OPCIONES PROPUESTAS en tarjetas A-F.

- **[friccion]** fila Origen, chip 'Auditoría enc-955f7fdd · 20-10' (centro-superior) — El identificador/fecha se parte en dos líneas ('20-' / '10') dentro del chip, con corte a mitad de dato, aspecto de texto truncado o mal envuelto.
- **[friccion]** enlace 'Ver sesión en vivo' junto al chip de Origen (centro-superior) — El enlace se envuelve en dos líneas ('Ver sesión en' / 'vivo') rompiendo la alineación horizontal de la fila Origen; el contenedor es demasiado estrecho.
- **[cosmetica]** opciones propuestas C, D, E (centro de la captura) — Las tarjetas C 'Donzapas', D 'BananaSurf', E 'Savage' sólo muestran un nombre propio sin verbo ni descripción, en contraste con A y B que sí enuncian la acción; jerarquía y contenido inconsistente que dificulta decidir.
- **[cosmetica]** esquina superior derecha de la barra de filtros — Pequeño control (checkbox con desplegable) pegado al borde derecho del viewport, de tamaño reducido y sin margen ni etiqueta visible, fácil de pasar por alto.

## pre/desktop-dark/session-scrolled
Vista de sesión en tema oscuro: sidebar izquierdo con navegación (Actividad, Línea de tiempo, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones, voz) + árbol de workspaces/files; barra superior con pestañas de sesión y contadores de tokens; área central con mensaje largo renderizado (listas, código inline, chips de ficheros), input con Send y barra de pie con controles.

- **[cosmetica]** borde derecho, junto al área del input (icono de candado) — Botón/icono de candado flotante pegado al borde derecho, casi recortado contra el margen de la ventana; parece un control suelto sin contenedor ni margen visible.
- **[cosmetica]** barra superior derecha (contadores 243k / 85k / 26.5M / 18% / 1.0M) — Cinco métricas apiladas sin etiquetas legibles ni separación clara; difícil saber qué representa cada valor de un vistazo (jerarquía confusa).
- **[cosmetica]** barra de pie inferior derecha (off / configured / Compact) — Etiquetas de estado en gris muy pequeño y bajo contraste sobre fondo oscuro; apenas legibles y sin relación clara con los iconos que las preceden.

## pre/desktop-dark/session
Vista de sesión con chat en zona central (mensaje largo estructurado con listas, código inline y chips de archivos + input abajo), sidebar izquierdo con navegación (Actividad, Línea de tiempo, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz), árbol de FILES y Settings; barra superior con pestañas (Full history, Generate title, Branches, System, Tools) y métricas de tokens/uso a la derecha.

- **[cosmetica]** placeholder del input de mensaje y botón Send (abajo centro) — Mezcla de idiomas: UI en español pero placeholder en inglés ("Message... Type / for commands, @ for files") y botón "Send" en inglés.
- **[cosmetica]** barra superior derecha (métricas: 243k, ↑85k, 26.5M, 18% / 1.0M) — Etiquetas numéricas muy pequeñas y en gris poco contrastado, sin unidades/labels claras que expliquen qué representa cada cifra (jerarquía confusa).
- **[cosmetica]** sidebar izquierdo, subetiquetas de navegación (pasado → próximo, entregables, prompts · skills) — Texto secundario en gris muy tenue sobre fondo oscuro, contraste bajo que dificulta la lectura.
- **[friccion]** área de chat, parte superior del mensaje visible — El mensaje aparece cortado por arriba (empieza a mitad de frase: "proceso pi-web.js reiniciado):") sin cabecera de mensaje visible (autor, timestamp, acciones), lo que dificulta ubicar el inicio y contexto del contenido.
- **[cosmetica]** barra de herramientas inferior del chat (Failover Fast, off, configured, Compact) — Controles y estados mezclados sin etiquetas claras ni separación visual consistente, con iconos pequeños apilados en la esquina inferior derecha.

## pre/desktop-dark/timeline
Vista Timeline en tema oscuro: barra superior con acciones globales, sidebar izquierdo con navegación (Actividad, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones), árbol de proyectos y sección FILES; panel principal con título 'Línea de tiempo', pestañas Eventos/Patrones por hora, chips de filtro por tipo, buscador y lista de eventos agrupados por fecha con descripciones largas.

- **[friccion]** panel principal — descripciones de eventos (filas 'caduca: ...' en Mié 21 Oct, Jue 22 Oct) — El texto de detalle va en gris muy apagado sobre fondo oscuro (#6-7 gris vs #0f172a), contraste bajo para lectura de párrafos largos de 3-4 líneas; es la información más densa de la vista y la más difícil de leer.
- **[cosmetica]** cabecera del panel — junto al botón 'Añadir' (esquina superior derecha) — Botón '×' de cierre pequeño, iconográfico y sin etiqueta, pegado al botón primario 'Añadir'; target reducido y riesgo de confusión/accidentalidad por proximidad al CTA principal.
- **[cosmetica]** pestañas Eventos/Patrones por hora — borde derecho de la pestaña 'Patrones por hora' — Queda un pequeño elemento/fragmento suelto justo tras la pestaña 'Patrones por hora' que parece un resto de control o badge cortado, rompiendo la limpieza de la fila de pestañas.
- **[cosmetica]** sidebar — fila 'Línea de tiempo' con subtítulo 'pasado → próximo' — El texto del subtítulo queda muy apretado contra el borde derecho del item y compite con el nombre de dos líneas del item, dejando la fila con aspecto congestionado y sin espacio de respiración.

## pre/desktop-light/home
Vista home con top bar (Full history, Generate title, System, Tools), sidebar izquierdo de navegación + árbol de archivos/sesiones, y en el centro el composer de nueva sesión con logo, breadcrumbs y campo de mensaje. Zona central muy aireada, sin datos de sesión todavía.

- **[friccion]** sidebar izquierdo, bloque de sesiones bajo 'exohuman-ui' — Estado vacío pobre: solo 'No sessions yet' en gris pequeño, sin icono, explicación ni CTA para crear la primera sesión, y en inglés dentro de una UI en español
- **[cosmetica]** composer central, placeholder del input y barra inferior — Mezcla de idiomas: placeholder 'Message... Type / for commands, @ for files' y controles 'auto'/'configured' en inglés mientras el resto de la interfaz está en español
- **[cosmetica]** top bar, botones 'Full history' y 'Generate title' — Texto en gris muy claro con contraste insuficiente sobre fondo claro; parecen deshabilitados aunque probablemente sean activos, lo que rompe la jerarquía frente a 'System'/'Tools' que sí son legibles
- **[friccion]** composer central, barra inferior derecha — Controles 'auto', 'configured', 'Compact' y el icono de volumen amontonados con texto pequeño gris y apenas separación entre ellos, sin agrupación ni jerarquía clara

## pre/desktop-light/post-studio
Post Studio con sidebar izquierdo (nav + árbol FILES), previsualización de carrusel tipo móvil a la izquierda del área principal y columna derecha con secciones de narrativa, música y lista de fotos ordenables; barra inferior con resumen y CTA de confirmación.

- **[cosmetica]** previsualización del carrusel (parte izquierda del área principal), cabecera oscura sobre la foto — El texto «rgsaura · La Herradura •» queda truncado/cortado contra el borde derecho de la tarjeta sin elipsis visible, el «•» final aparece a medias.
- **[friccion]** sección 2 · Música, tarjeta B «Indie emotivo» (centro-derecha) — Estado de reproducción inconsistente: el botón circular azul muestra icono de pausa pero la línea de estado dice «en pausa · 0:00 / 0:00 · loop», con duración 0:00/0:00 (sin pista cargada) y una barra de progreso vacía apenas visible.
- **[cosmetica]** sección 3 · Tus fotos, parte inferior de la lista (centro-derecha) — La fila 6 «Velas» queda cortada a la mitad bajo la barra inferior fija (footer), sin padding de cierre del scroll ni separación que indique que la lista continúa.

## pre/desktop-light/proposals
Vista de Decisiones con sidebar izquierdo (navegación, workspaces, árbol FILES) y área principal: barra de filtros (Pendientes/Todas, categoría, urgencia) y una propuesta detallada con badge de estado, título, origen, descripción y 5 opciones A–E en tarjetas.

- **[friccion]** área principal, tarjetas de opciones A–E — Las opciones se muestran como filas con badge de letra, pero no hay ningún control visible (botón/checkbox/enlace) para elegir, votar o descartar una opción; sólo texto, lo que deja la acción principal sin affordance visible.
- **[cosmetica]** barra superior derecha, botón de icono junto al desplegable 'Por urgencia / caducidad' — El botón de icono queda muy pegado al borde derecho del viewport (margen menor que el resto de la interfaz), lo que rompe la retícula del header.
- **[cosmetica]** área principal, tarjeta de opción B — La opción B contiene sólo 'limpieza' (una palabra, en minúsculas) mientras el resto lleva descripciones completas; la altura de las tarjetas y la información quedan descompensadas y la jerarquía de decisión es confusa.

## pre/desktop-light/session
Vista de sesión de chat en desktop 1440x900 con sidebar izquierdo (nav, workspace, árbol FILES), área central con mensaje largo de agente (5 secciones + chips de archivos), input de mensaje abajo y barra de estado inferior; top bar con pestañas de herramientas y contadores de recursos.

- **[cosmetica]** Sidebar izquierdo, metadatos de cada entrada ("pasado→próximo", "entregables", "pre", "prompts·skills") — Texto secundario en gris muy claro sobre fondo blanco, tamaño pequeño: contraste bajo y difícilmente legible en las etiquetas de estado de las entradas de navegación.
- **[cosmetica]** Barra superior derecha, contadores de recursos (↑243k ↓85k 26.5M 18%/1.0M) — Contadores amontonados contra el borde derecho sin separación ni etiquetas de tooltip visibles; el contador de descarga muestra un carácter de relleno/superíndice pegado al valor ("85k") que rompe la alineación visual.
- **[cosmetica]** Barra de estado inferior derecha ("off" / "configured" / "Compact") — Etiquetas sueltas sin icono ni texto descriptor claro (p.ej. "configured" no indica qué está configurado), jerarquía confusa en comparación con "Failover Fast" que sí tiene icono.

## pre/desktop-light/timeline
Vista Timeline con sidebar de navegación (Actividad, Paneles, Agentes, Workspaces, Encargos, Decisiones, Voz) y panel principal con pestañas Eventos/Patrones por hora, chips de filtro por tipo y barra de búsqueda. El área de contenido está vacía: todos los contadores a 0 y sin eventos listados.

- **[friccion]** cabecera del panel principal, bajo 'Línea de tiempo' — Persiste el texto 'cargando...' mientras el área de eventos queda en blanco sin skeleton ni mensaje de estado, dando sensación de loader eterno o carga colgada.
- **[friccion]** sidebar izquierdo, entre el ítem 'Hablar por Voz' y la sección FILES — Aparece suelto el texto crudo 'Loading...' en inglés sin traducir ni contenedor, rompiendo la coherencia con el resto de la UI en español.
- **[friccion]** área de contenido de la Timeline, debajo de la barra de búsqueda — Estado vacío sin contenido: no hay ilustración, ni copy de 'no hay eventos', ni CTA para crear el primer evento, dejando una zona blanca enorme junto al botón 'Añadir'.
- **[cosmetica]** sidebar izquierdo, barra de herramientas de la sección FILES — Fila de iconos (terminal, carpeta, upload, etc.) muy pequeños y sin etiquetas, amontonados sobre un input vacío, con targets difíciles de distinguir y de clicar.
- **[cosmetica]** chips de filtro (Todos 0, Encargos 0, ... Retro 0) — Todos los chips muestran contador 0, por lo que la fila de 10 filtros aporta ruido sin utilidad cuando no hay datos que filtrar.

## pre/mobile-dark/encargos
Vista Encargos en móvil con tema oscuro: barra superior, cabecera con título, badge de activos, contadores y acciones, filtros por estado/área y lista de tarjetas de encargos (estado, dificultad, área, duración, id, título, descripción y CTA).

- **[friccion]** Cabecera superior derecha, fila de acciones (botones 'Actualizar' y 'Cerrar') — El botón 'Cerrar' queda cortado por el borde derecho de la pantalla: la fila de acciones desborda horizontalmente y el botón no se ve completo ni es tocable entero.
- **[friccion]** Cabecera junto al título: badge '5 activos' + contador '197 total' — El badge '5 activos' queda aplastado entre el título y '197 total', con el texto partido en dos líneas ('5'/'activos') y '197 total' también envuelto en dos líneas; bloque de contadores apretado y de lectura confusa.
- **[cosmetica]** Título de la vista 'Encargos y Objetivos' (superior izquierda) — El título se parte en tres líneas ('Encargos'/'y'/'Objetivos') por el badge contiguo, ocupando mucho espacio vertical en móvil.
- **[friccion]** Fila de meta de cada tarjeta (derecha: 'Llevan 5m' e id 'enc-…') — En las tres tarjetas 'Llevan 5m' y el id se parten a mitad ('Llevan'/'5m', 'enc-'/'6d8067e1', 'enc-'/'ebe31041'), quedando guiones y números huérfanos con aspecto descuidado.
- **[cosmetica]** Filtro de estado activo 'En curso / Activos' — El texto del filtro se envuelve en dos líneas dentro del botón, rompiendo la alineación con 'Todos' y 'Completados' que van en una línea.

## pre/mobile-dark/home
Vista home móvil en tema oscuro con barra superior (menú, '…', 'Session info', toggle de panel) y bloque central-abajo: logo 'Exohuman UI' con versión, selectores de workspace y rama, composer con placeholder y fila de controles (imagen, mic, failover, more controls). Gran zona vacía en la mitad superior y bajo los controles; no se ve lista de sesiones.

- **[friccion]** centro / mitad superior de la pantalla — Más de la mitad del viewport está en blanco: el bloque de marca + composer está verticalmente centrado dejando ~500px vacíos arriba y ~500px abajo, sin lista de sesiones visible ni ningún estado que ocupe la zona; la home se siente vacía y el contenido relevante queda desplazado hacia el tercio inferior.
- **[friccion]** fila de selectores, a la derecha del workspace: selector de rama/entorno — El texto aparece truncado por el borde izquierdo ('…eles-integrador') sin identificar el nombre completo; el truncado inicial rompe la lectura del elemento seleccionado.
- **[friccion]** fila de controles bajo el composer: selector de failover — Etiqueta truncada 'Failover Normal (Defa…' sin poder saber el valor real ('Default…') en móvil; falta de ancho o de tooltip/abreviación clara.
- **[cosmetica]** fila de controles bajo el composer: iconos de adjuntar imagen y micrófono — Targets táctiles pequeños (iconos de ~24px sin padding visible de 44px) en una fila compacta junto a texto; en móvil los iconos de imagen/mic son difíciles de tocar con precisión.
- **[cosmetica]** barra superior derecha: texto 'Session info' — Contraste bajo del label gris sobre fondo casi negro; poco legible en móvil y su función no queda clara junto al icono de panel.
- **[cosmetica]** composer: placeholder del input — Placeholder largo ('Message... Type / for commands, @') en fuente grande que ocupa casi todo el ancho disponible del input, compitiendo con el botón de envío y dando sensación de desborde.

## pre/mobile-dark/paneles
Vista Paneles (móvil 390x844, tema oscuro): barra superior con menú y 'Session info', cabecera 'Paneles e Informes' con badge '8 activos' y botones Actualizar/Cerrar, pestañas Activos/Archivados/Todos, buscador y listado de tarjetas de informes (INFORME + fecha + título + descripción + botón Sesiones).

- **[cosmetica]** Cabecera de sección 'INFORMES 4' (izquierda) y botón 'Sesiones ▼' de cada tarjeta — El icono se renderiza como un cuadro vacío (glyph roto/emoji o fuente de iconos ausente) tanto en el encabezado de la sección como en el botón de cada tarjeta, aspecto de placeholder.
- **[cosmetica]** Botones 'Actualizar' y 'Cerrar' bajo el título (arriba-izquierda) — 'Cerrar' es ambiguo y comparte el mismo peso visual que 'Actualizar'; en móvil no queda claro qué acción cierra (panel, vista o sesión).

## pre/mobile-dark/post-studio
Vista Post Studio en móvil: barra superior con menú y Session info, cabecera con título del estudio, badge PRE y botón Cerrar, pestañas Carrusel/Reel, tarjeta de previsualización de post de Instagram (foto de portada, contador 1/19, puntos de paginación, etiqueta Portada) y pie con resumen del carrusel y CTA Confirmar decisión.

- **[friccion]** cabecera Post Studio (parte superior, línea de título) — El título queda truncado con elipsis ("Post Studio · La Herradura · Cum...") en 390px, no se ve el nombre completo del proyecto
- **[friccion]** pestañas Carrusel/Reel y junto al título (iconos) — Los iconos de las pestañas Carrusel y Reel y el icono previo al título se renderizan como glifos de sustitución (cuadrado vacío), indicando icono/emoji roto o ausente
- **[cosmetica]** overlay inferior de la tarjeta de previsualización (indicador de paginación) — La fila de puntos del carrusel es muy pequeña y el "+7" aparece pegado a los puntos sin separación clara, con targets táctiles mínimos en móvil
- **[cosmetica]** cabecera de la tarjeta de previsualización (sobre la foto) — El texto "rsgaura · La Herradura" se apoya sobre una zona clara de la imagen con degradado poco marcado, contraste justo para lectura

## pre/mobile-dark/proposals
Vista Decisiones en móvil con header, barra de filtros (Volver, pestañas Pendientes/Todas, orden por urgencia) y chips de categoría, seguida de una tarjeta de propuesta con badges, título, origen, descripción larga y el inicio de las opciones propuestas (opción A).

- **[friccion]** barra de filtros superior, extremo derecho — El botón 'Por urgen...' queda cortado por el borde del viewport: overflow horizontal visible, texto truncado y sin indicación de scroll (además el icono interior es un glifo roto).
- **[friccion]** pestañas 'Pendientes (7)' y 'Todas (106)' (centro-superior) — Los iconos de las pestañas se renderizan como cajas tofu (□ / glifo faltante) en lugar de un emoji/icono, indicando fallo de renderizado de fuentes de símbolos.
- **[friccion]** tarjeta de opción A (abajo), badge 'A' — El badge cuadrado 'A' está anclado abajo a la izquierda mientras el texto de la opción ocupa la parte superior: desalineación vertical rota entre badge y contenido.
- **[cosmetica]** fila 'Origen:', enlace 'Ver sesión en vivo' (derecha) — El icono de enlace externo queda pegado al borde del chip de origen y el texto del enlace se parte en dos líneas justo al lado, quedando apretado contra el chip.

## pre/mobile-dark/session
Vista de sesión en móvil con mensaje largo de agente (texto con numeración, etiquetas de archivo en chips), barra de controles inferior con input, iconos y acciones, y barra superior con métricas de tokens. Sin overflow horizontal global y con buena jerarquía de texto.

- **[friccion]** barra inferior de controles, extremo derecho ('More controls') — El label 'More controls' queda pegado al borde derecho de la pantalla sin margen de seguridad, riesgo de recorte/overflow en 390px y sin padding lateral consistente respecto al resto de la barra.
- **[cosmetica]** borde superior del área de contenido bajo la barra fija — El texto del mensaje queda cortado a media línea bajo la barra superior sin separación visual (fade/padding), da sensación de contenido roto al hacer scroll.
- **[cosmetica]** barra inferior, fila de iconos (imagen, micrófono, chip) y 'Failover Fast' — Controles de la barra inferior desiguales en estilo y peso visual: iconos sueltos a la izquierda frente a botones de texto ('Failover Fast', 'More controls'), jerarquía confusa y anchos de target variables en móvil.

## pre/mobile-dark/sidebar-open
Móvil 390x844 con tema oscuro y sidebar abierto como drawer que cubre la mayor parte de la pantalla: barra superior de iconos/métricas, sección de tarjetas de navegación (Actividad, Línea de tiempo, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz), árbol de workspaces/proyectos abajo y botón Settings fijo al pie. El contenido de la sesión queda parcialmente visible en la franja derecha.

- **[friccion]** árbol de workspaces, filas 'Proyecto: …' (mitad inferior del sidebar) — Nombres de proyecto truncados con puntos suspensivos (wt-panele…, wt-postst…, wt-resilie…, wt-seccio…, wt-timelin…) lo que impide distinguirlos entre sí en móvil
- **[friccion]** árbol de workspaces, botones '+' y '…' de cada fila — Targets táctiles pequeños y muy juntos (los tres puntos '…' y el '+'), por debajo del mínimo cómodo de ~44px en móvil
- **[cosmetica]** tarjeta 'Línea de tiempo', parte superior del sidebar — El título salta a dos líneas mientras 'pasado → próximo' también se parte en dos, generando una fila desalineada respecto al resto de tarjetas de una sola línea
- **[cosmetica]** barra superior derecha, junto al icono de panel — Métricas '85k 18%' sin etiqueta ni unidad, difíciles de interpretar y compitiendo con los iconos de acción
- **[cosmetica]** franja derecha tras el drawer — El texto del contenido subyacente queda cortado a media palabra sin scrim de fondo claro, lo que hace que la parte visible se lea como contenido roto

## pre/mobile-dark/timeline
Vista Timeline móvil en tema oscuro: barra superior, cabecera con título y acciones, pestañas Eventos/Patrones, fila de filtros con contadores, buscador, y lista de eventos agrupados por día (Mié 21 Oct, Jue 22 Oct) con rutinas programadas y encargos con descripción larga.

- **[friccion]** fila de filtros (chips) bajo las pestañas, borde derecho — El cuarto chip (con icono de aviso) aparece cortado a la derecha: se ve solo su icono sin etiqueta ni indicador de scroll, por lo que no se entiende qué filtro existe ni que la fila es desplazable.
- **[friccion]** tarjeta de evento 'caduca: Exploración de planes: Coworking & Founder Meetup en Chamberí Café', sección Mié 21 Oct — La descripción se muestra íntegra sin colapsar (párrafo de ~8 líneas) y ocupa prácticamente media pantalla, empujando el resto del timeline y rompiendo el ritmo visual del listado; falta line-clamp o 'ver más'.
- **[cosmetica]** iconos de cada fila de evento y de los chips de filtro (columna izquierda) — Los iconos se renderizan como rectángulos/cajas idénticos y sin semántica aparente (posibles glifos rotos o placeholder), lo que no ayuda a distinguir rutina / encargo / decisión de un vistazo.
- **[cosmetica]** cabecera superior derecha, 'Session info' e icono de panel — El texto 'Session info' está en inglés en una interfaz totalmente en español y su target junto al icono de panel es estrecho, con ambos elementos muy pegados al borde superior.

## pre/mobile-light/home
Vista móvil con barra superior (menú, ..., 'Session info', icono panel), gran zona vacía superior y bloque inferior con branding 'Exohuman UI v1.0.0 · pi v1.2.0', breadcrumbs de workspace/agente, composer de mensaje y fila de controles. No se ve el sidebar de sesiones.

- **[friccion]** bloque breadcrumbs, a la derecha de 'workspaces/exohuman-ui' — El nombre del agente/workspace aparece truncado por la izquierda ('...eles-integrador'): el usuario no puede identificar el elemento completo ni saber cuál está seleccionado.
- **[friccion]** fila de controles bajo el composer, elemento 'Failover Normal (Defa...' — Etiqueta de configuración truncada con puntos suspensivos; no se lee el modo de failover completo.
- **[friccion]** mitad superior de la pantalla (desde la barra superior hasta el logo) — Zona enorme vacía sin contenido ni estado que la explique: el bloque útil queda amontonado en la parte baja, sin jerarquía ni indicación de qué hacer primero; además no se ve el sidebar de sesiones en móvil.
- **[cosmetica]** barra superior derecha, texto 'Session info' — Contraste muy bajo (gris azulado claro sobre blanco) y mezcla de idioma inglés frente al resto de la interfaz en español.
- **[cosmetica]** subtítulo bajo el logo, 'v1.0.0 · pi v1.2.0' — Versión en gris muy tenue con contraste insuficiente sobre fondo claro.
- **[cosmetica]** fila de controles del composer, iconos de imagen y micrófono — Iconos pequeños y muy juntos entre sí y respecto a los textos adyacentes; en móvil el área táctil efectiva parece <44px, incómodo de pulsar.

## pre/mobile-light/post-studio
Vista Post Studio en móvil: barra superior, cabecera con título del post y badge PRE, selector Carrusel/Reel, previsualización tipo Instagram del carrusel (1/19) y pie con resumen y botón de confirmación.

- **[friccion]** cabecera, línea de título 'Post Studio · La Herradura · Cum...' — El título queda truncado con 'Cum...' y no se puede ver el nombre completo del post sin opción de expandir.
- **[cosmetica]** cabecera (icono junto al título) y pestañas 'Carrusel' y 'Reel' — Los iconos se renderizan como cuadrados vacíos (tofu/glyph faltante), sugiriendo emoji o fuente de iconos no cargada.
- **[cosmetica]** tarjeta de previsualización, paginación inferior de fotos — Se muestran 12 puntos + '+7' junto al contador '1/19'; el '+7' es ambiguo respecto a cuántas fotos hay realmente y su relación con los puntos.

## pre/mobile-light/proposals
Vista de propuestas en móvil: barra superior, filtros (Pendientes/Todas, Categoría, Por decidir/SISTEMA), tarjeta de propuesta con título, origen, descripción larga y opciones propuestas. Contenido con datos, sin estado vacío.

- **[friccion]** fila de filtros superior (Pendientes/Todas) — borde derecho de la pantalla — El botón 'Por urgen…' queda cortado y desborda horizontalmente fuera del viewport 390px; no se ve completo ni hay indicador claro de scroll.
- **[cosmetica]** bloque Origen — chip junto a título — El chip de origen con texto monoespaciado ('Sesión proactiva · conexiones · 17-10') se parte en dos líneas dentro de su caja con borde, resultando apretado y con aspecto roto.
- **[cosmetica]** enlace 'Ver sesión en vivo' — derecha del chip Origen — El enlace se parte en dos líneas ('Ver sesión / en vivo') apretado contra el chip de origen, con poco espacio y jerarquía visual confusa en móvil.
- **[cosmetica]** cabecera superior — 'Session info' y icono de panel — Texto 'Session info' en color gris muy claro sobre fondo claro, contraste bajo y difícil de leer en móvil.

## pre/mobile-light/session
Vista móvil 390x844 de sesión con mensaje de agente (texto largo con listas numeradas, chips de archivos referenciados, meta de tokens/fecha) y barra inferior con input de mensaje, controles rápidos y pie con estado de modelo.

- **[cosmetica]** Cuerpo del mensaje, línea con el chip '( console/proposals/activity/mobile-check )' — El chip de código inline se solapa visualmente con los paréntesis que lo envuelven: el '(' queda tapado por el borde izquierdo del chip y el ')' pegado/superpuesto al borde derecho.
- **[cosmetica]** Barra inferior derecha, botón 'More controls' — El texto llega muy pegado al borde derecho del viewport, sin margen de seguridad, y junto a 'Failover Fast' se lee en gris claro con bajo contraste sobre fondo blanco.
- **[cosmetica]** Pie inferior, fila '⚡ Default' — La fila de estado queda casi pegada al borde inferior de la pantalla con padding mínimo y tono gris muy claro, apenas legible.

## pre/mobile-light/sidebar-open
Vista móvil 390x844 con el sidebar abierto sobre el contenido atenuado: barra superior con iconos/estadísticas, lista de secciones principales (Actividad, Línea de tiempo, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz), árbol de proyectos abajo y Settings fijado al pie.

- **[friccion]** Lista de proyectos del sidebar (mitad inferior) — Los nombres de proyecto se truncan con puntos suspensivos sin espacio suficiente: 'wt-panele...', 'wt-postst...', 'wt-resilie...', 'wt-seccio...', 'wt-timelin...' quedan indistinguibles entre sí en móvil; no hay forma de ver el nombre completo ni tooltip visible.
- **[cosmetica]** Item 'Línea de tiempo' del sidebar — El rótulo rompe en dos líneas ('Línea de / tiempo') mientras el resto de items son de una línea, rompiendo el ritmo vertical y acercando el icono al texto.
- **[friccion]** Fila de proyectos del sidebar (derecha, columnas '+' y '...') — Los targets táctiles de '+' y el menú '...' son muy pequeños y están muy próximos entre sí en móvil, riesgo de tap accidental.
- **[cosmetica]** Chevrons de expandir del árbol de proyectos (izquierda) — Los iconos '>' son muy pequeños y con poco contraste gris, difíciles de tocar y de percibir como control de expansión.

## pre/mobile-light/timeline
Vista Timeline móvil (390x844, tema claro): barra superior con menú y Session info, cabecera 'Línea de tiempo' con contador de eventos, botón Añadir y cerrar, pestañas Eventos/Patrones por hora, fila de filtros (Todos/Encargos/Decisiones) y buscador, seguido de la lista agrupada por día (Mié 21 Oct, Jue 22 Oct) con eventos de rutinas y encargos con descripción larga.

- **[friccion]** fila de filtros (chips) — borde derecho de la captura — El cuarto chip se corta contra el borde derecho (solo se ve el icono ⚠ a medio render) sin indicación de scroll ni degradado: overflow horizontal no comunicado.
- **[friccion]** iconos de toda la interfaz (botón Añadir, pestañas Eventos/Patrones por hora, chips Encargos/Decisiones, iconos de cada fila de evento) — Los iconos/emojis se renderizan como cuadrados vacíos (tofu □): glifo no disponible, iconografía ilegible y fea. En el evento 'caduca: Exploración de planes...' aparecen dos cuadrados seguidos.
- **[friccion]** evento 'caduca: Exploración de planes: Coworking & Founder Meetup…' (bloque Mié 21 Oct, mitad inferior) — La descripción se vuelca completa en el timeline (párrafo de ~10 líneas sin clamp ni colapso), rompe el ritmo de escaneo de la lista y empuja el resto de eventos fuera de pantalla.

## pre/tablet-dark/home
Vista home con sidebar izquierdo muy ancho (nav de módulos + árbol de sesiones/workspaces/FILES) y panel principal centrado con logo, breadcrumb de rutas, composer de nueva sesión y fila de controles debajo. Tema oscuro, mucho espacio vacío en la zona principal.

- **[friccion]** Sidebar izquierdo, lista de sesiones bajo 'Proyecto: wt-poststudio-v2' — El nombre de sesión 'ENCARGO OFICIAL (enc-ebe3...' aparece truncado con puntos suspensivos, no se ve el identificador completo ni la fecha 'now' queda bien enlazada con el texto cortado.
- **[friccion]** Sidebar izquierdo, pestañas de la sección FILES — Los chips de pestañas muestran texto truncado: '..xohuman-ui' y '..udio-v2 12' (debería ser 'post-studio-v2'), el nombre del workspace/fork no se lee.
- **[friccion]** Sidebar global en viewport 820px — El sidebar ocupa más de la mitad del ancho (~520px de 820px), dejando el panel principal muy comprimido y generando una jerarquía invertida respecto a la vista de sesión.
- **[friccion]** Sidebar izquierdo, estado vacío 'exohuman-ui' > 'No sessions yet' — Estado vacío solo con texto plano en gris, sin icono, explicación ni CTA para crear la primera sesión; además está en inglés en una UI mayoritariamente en español.
- **[cosmetica]** Barra superior, botones 'Full history' y 'Generate title' — Texto e iconos con contraste muy bajo sobre el fondo oscuro (parecen deshabilitados sin feedback claro), difíciles de leer.
- **[cosmetica]** Sidebar izquierdo, fila 'Línea de tiempo' — El label 'Línea de tiempo' salta a dos líneas y 'pasado→ próximo' también, la fila queda desalineada respecto a las demás del nav.
- **[cosmetica]** Sidebar izquierdo, toolbar de FILES (fila de iconos >_ folder subir refresh ojo etc.) — Seis iconos amontonados sin separación ni etiquetas, con targets táctiles pequeños para tablet; difícil distinguir su función.
- **[cosmetica]** Panel principal, fila de controles bajo el composer ('Failover Normal (Default)' 'auto' 'configured' 'Compact') — Controles dispersos en una sola línea con etiquetas ambiguas ('auto', 'configured') sin agrupación ni jerarquía, y 'Compact' pegado al borde derecho de la zona útil.

## pre/tablet-dark/post-studio
Vista Post Studio con barra lateral izquierda (nav + árbol FILES), preview del carrusel 1/19 en el centro y panel derecho de narrativa/música, con barra inferior de acción Confirmar decisión.

- **[friccion]** Panel derecho, tarjetas de música (A Rumba / B Indie emotivo) — El texto de descripción se parte a una o dos palabras por línea (columna demasiado estrecha), ilegible: 'Rumba mediterránea con base moderna' y 'El sur, la terraza, la barbacoa...' ocupan un ancho mínimo con saltos de línea extremos.
- **[friccion]** Panel derecho, tarjeta B · Indie emotivo (borde inferior) — La tarjeta queda cortada por la barra inferior de acciones ('despedida' truncada y texto continuo oculto), obligando a scroll y con riesgo de perder contenido.
- **[cosmetica]** Barra lateral izquierda, sección FILES — El árbol de archivos ocupa toda la altura del sidebar empujando el resto del contenido y compitiendo con la vista principal; en tablet 820px el espacio central se estrecha considerablemente.
- **[cosmetica]** Cabecera Post Studio, botón 'Cerrar' junto a badge 'PRE · nada se publica' — Los controles de cabecera están apretados y desbalanceados respecto al título, con poco aire entre badge y botón.

## pre/tablet-dark/proposals
Vista de Decisiones con sidebar izquierdo (nav + árbol FILES) y panel derecho con tarjeta de decisión en curso: opciones A/B/C, campo de respuesta personalizada con dictado, descarte y paginación inferior.

- **[cosmetica]** Sidebar izquierdo + cabecera principal (iconos de 'Línea de tiempo', 'Paneles', 'Post Studio', 'Agentes', pestañas 'Pendientes'/'Todas', checkbox de 'Respuesta personalizada') — Los iconos se renderizan como rectángulos vacíos (glifos tofu), señal de fuente/icon set roto en el build PRE; se repite en toda la UI
- **[friccion]** Tarjeta 'Respuesta personalizada', parte superior derecha junto al botón 'Dictar audio' — El botón 'Dictar audio' comprime el titular, que se parte en dos líneas con quiebre antinatural ('texto libre o nota / de voz):') y poco aire entre ambos
- **[cosmetica]** Fila inferior de paginación, botón '← Anterior' — El botón 'Anterior' aparece deshabilitado con texto de bajo contraste sobre fondo casi idéntico, apenas legible

## pre/tablet-dark/session
Vista de sesión con chat: sidebar izquierdo con navegación, lista de proyectos/workspaces y árbol de FILES; zona central con mensaje largo en markdown (listas numeradas, código inline, badges de archivos) y barra de input abajo con controles de pie.

- **[friccion]** zona central, fila inferior de badges de archivos justo encima del input — La última fila de chips de archivos ('workspaces-data.ts', 'mobile-check.mjs') queda cortada/oculta tras la barra de mensaje: el contenido del mensaje se solapa o desborda bajo el input y no se puede ver completa sin scroll manual
- **[cosmetica]** barra superior, extremo derecho (junto al toggle de panel) — El indicador 'N/M' del agente queda truncado/cortado por el borde derecho del viewport, mostrando solo una parte de la etiqueta
- **[cosmetica]** barra superior derecha, icono flotante suelto — Aparece un icono de candado desplazado a la derecha sobre el área de chat, separado del resto de controles y sin alineación clara con la barra de herramientas
- **[cosmetica]** sidebar izquierdo, entrada 'Línea de tiempo' — El label 'Línea de tiempo' envuelve a dos líneas mientras la meta 'pasado → próximo' también ocupa dos, haciendo la fila más alta y desalineada respecto al resto de entradas del menú

## pre/tablet-dark/timeline
Vista Timeline en tablet oscura: barra superior, sidebar izquierda larga (navegación + árbol de workspaces/files + Settings) y panel derecho con cabecera 'Línea de tiempo', pestañas Eventos/Patrones, chips de filtro y buscador, pero el contenido principal está en blanco en estado 'cargando...' con todos los contadores a 0.

- **[friccion]** panel derecho, fila de chips de filtro (horizontal, borde derecho) — La fila de chips desborda: el chip 'Re...' queda cortado/clipped contra el borde derecho de la pantalla (viewport 820px) sin scroll horizontal visible ni degradado indicativo; se pierde acceso al resto de filtros.
- **[friccion]** sidebar ítems (Línea de tiempo, Paneles, Post Studio, Agentes...), pestañas Eventos/Patrones y botón Añadir — Los iconos se renderizan como cuadrados vacíos (tofu/glyph faltante) en lugar de su icono real: se pierde la señal visual de cada sección y el botón 'Añadir' muestra un cuadrado sin significado.
- **[friccion]** panel derecho, área de contenido central — Estado combinado confuso: el subtítulo dice 'cargando...' pero todos los chips muestran 0 y la zona queda en negro absoluto sin mensaje de vacío, ni loader, ni CTA; el usuario no sabe si sigue cargando o no hay datos.
- **[cosmetica]** sidebar, ítem de navegación con badge 4 (entre Workspaces y Decisions) — Inconsistencia de naming: en el sidebar aparece 'Encargas' mientras en los chips del filtro aparece 'Encargos 0'; tipografía/etiqueta incorrecta.

## pre/tablet-light/home
Vista home con sidebar izquierdo muy denso (nav de módulos, árbol de sesiones 'No sessions yet', explorador de FILES largo, Settings fijado abajo) y zona principal con hero Exohuman UI, selectores de workspace/branch, composer con botón Send y fila de controles (Failover, auto, configured, Compact). Sobre tablet 820px el sidebar ocupa casi el 40% del ancho y la zona principal queda con enorme vacío arriba y abajo del composer.

- **[friccion]** sidebar izquierdo, sección de sesiones ('exohuman-ui') — El estado vacío de sesiones es sólo la línea 'No sessions yet' en gris claro, sin icono, explicación ni CTA para crear la primera sesión, además de convivir sin separación clara con el explorador de FILES justo debajo.
- **[friccion]** sidebar, fila 'ENCARGO OFICIAL (enc-6d80...' del árbol de sesiones — El nombre del encargo aparece truncado con puntos suspensivos sin tooltip ni forma de ver el id completo (enc-6d80…), lo que impide identificar el encargo.
- **[friccion]** zona principal (derecha), área entre topbar y hero/composer — En 820x1180 el hero y el composer flotan en el centro de una zona principal mayormente vacía (huecos grandes arriba y abajo), con el sidebar ocupando ~40% del ancho: en tablet la jerarquía queda confusa y el composer desperdicia espacio horizontal útil.
- **[cosmetica]** sidebar, fila 'Línea de tiempo' — El subtítulo 'pasado → próximo' se parte en dos líneas y queda apretado contra el título 'Línea de tiempo', rompiendo la alineación horizontal del resto de filas de navegación.
- **[cosmetica]** topbar superior, items 'Full history' y 'Generate title' — Texto en gris muy claro con contraste insuficiente respecto al fondo, leyéndose como deshabilitado/ilegible en tema claro.
- **[cosmetica]** barra de controles bajo el composer (derecha) — Los controles (imagen, micrófono, 'Failover Normal (Default)', 'auto', 'configured', 'Compact') están muy separados entre sí y 'Compact' queda pegado al borde derecho del área, con iconos sueltos sin etiqueta que aprietan la lectura en tablet.

## pre/tablet-light/post-studio
Post Studio con tres columnas: sidebar izquierdo con navegación y file tree, centro con preview de carrusel 1/19 sobre fondo oscuro, columna derecha con narrativa y tarjetas de música, más barra inferior de confirmación.

- **[friccion]** columna derecha, tarjetas de música (A · Rumba y B · Indie emotivo) — Las tarjetas son demasiado estrechas para el texto: la descripción se envuelve con 1-2 palabras por línea ("Rumba mediterránea con base moderna"), generando bloques verticales ilegibles y desperdicio de altura.
- **[friccion]** columna derecha, tarjeta B · Indie emotivo, parte inferior — El contenido de la tarjeta queda cortado/oculto tras la barra inferior fija ("despedida..." se corta a mitad de palabra): solape del footer con el contenido scrolleable, sin margen de respiro.
- **[cosmetica]** centro, preview del carrusel, flechas laterales < > — Los botones de navegación del carrusel son círculos pequeños sobre la foto, con bajo contraste respecto a la imagen, difícil de localizar y target táctil justo en tablet.
- **[cosmetica]** barra inferior, botón "Confirmar decisión → OpenPost" — El botón de acción primaria queda muy pegado al borde derecho de la pantalla, sin margen lateral visible, y su texto es largo para el ancho disponible.
- **[cosmetica]** columna derecha, titular "2 · MÚSICA — PULSA PARA ESCUCHAR" — El titular en mayúsculas se parte en tres líneas por el ancho estrecho de la columna, rompiendo la jerarquía visual respecto al resto de secciones.

## pre/tablet-light/proposals
Vista Decisiones en tablet: sidebar izquierda con navegación, árbol de workspace y FILES; zona principal con pestañas Pendientes/Todas, filtros, y una propuesta de poda con descripción y opciones A-H listadas.

- **[friccion]** Opciones propuestas · opción B (centro de la captura) — El texto queda truncado a media frase: 'Aprobar solo podas evidentes (Viper' sin cerrar el paréntesis ni mostrar elipsis/indicador de texto continuado; no se sabe si hay más contenido oculto.
- **[friccion]** Sidebar navegación + pestañas superiores (Pendientes/Todas) — Los iconos se renderizan como cuadrados vacíos (tofu/glyph faltante) en 'Línea de tiempo', 'Paneles', 'Post Studio', 'Agentes', 'Decisiones' y delante de 'Pendientes'/'Todas': iconografía rota en tema claro.
- **[cosmetica]** Bloque Origen · enlace 'Ver sesión en vivo' (junto a la tarjeta Origen) — El enlace se rompe en tres líneas apiladas ('Ver / sesión / en vivo') por estar en una columna demasiado estrecha; aspecto desordenado frente al botón contiguo.
- **[cosmetica]** Fila de filtros superior derecha · botón junto al select 'Por urgencia / caducidad' — El botón muestra glifos ilegibles ('→·') en lugar de un icono reconocible, probablemente glyph faltante o tooltip mal pintado.

## pre/tablet-light/session
Vista de sesión con sidebar izquierdo (nav, workspace list, file tree, Settings) y área de chat con mensaje largo, chips de archivos y barra de entrada abajo. Topbar con acciones horizontales.

- **[friccion]** barra superior derecha (topbar) — El grupo de acciones se desborda: se ve un item cortado a 'OM' sin poder leerlo ni scrollear fácilmente en tablet.
- **[friccion]** zona inferior del mensaje de chat (chips de archivos) sobre el input — La fila de chips 'workspaces-data.ts' y 'mobile-check.mjs' queda tapada/cortada por la barra de entrada de mensaje, sin margen de separación.

## pre/tablet-light/timeline
Layout de dos paneles: sidebar izquierdo con navegación (Actividad, Línea de tiempo, Paneles, Post Studio, Agentes, Workspaces, Encargos, Decisiones, voz) y árbol de archivos; panel derecho con la vista Timeline (pestañas Eventos/Patrones, filtros por tipo, buscador y lista de eventos agrupados por día con 679 eventos).

- **[cosmetica]** Varios iconos en toda la interfaz (botón 'Añadir' del header, pestañas 'Eventos'/'Patrones por hora', chips 'Encargos/Decisiones/Informes', títulos 'Proyecto: ...' del sidebar y marcadores 'caduca' de los eventos) — Los iconos se renderizan como cuadrados vacíos (tofu/glifo faltante), indicando una fuente de iconos que no carga o caracteres no soportados; afecta a gran parte de la UI y rompe la legibilidad de acciones.
- **[friccion]** Fila de chips de filtros de tipo de evento (bajo las pestañas), borde derecho del panel — La fila de chips se desborda horizontalmente: el chip 'Informes 1…' queda cortado en el borde derecho y parece haber más filtros ocultos sin scroll ni indicador visible.
- **[cosmetica]** Sidebar izquierdo, sección 'Línea de tiempo' y 'Paneles' — El subtítulo 'pasado → próximo' envuelve en dos líneas y queda casi pegado al borde de la tarjeta, con la flecha suelta en la segunda línea; jerarquía algo desordenada.

## prod/desktop-dark/activity
Vista Activity oscura (1440x900): sidebar izquierdo con navegación, lista de proyectos, panel FILES con árbol y Settings; contenido principal con tarjetas de canales, palanca de gasto/tokens, buscador de sesiones pi en vivo y tarjetas de sesión con acciones.

- **[friccion]** sidebar izquierdo, lista de proyectos (entre 'Proyecto: wt-explorer' y el header 'FILES') — La lista de proyectos se corta a mitad de fila: hay un elemento parcialmente visible recortado por el panel FILES, sin indicación clara de scroll (clipping vertical).
- **[cosmetica]** sidebar izquierdo, lista de proyectos; tarjeta 'FaceSearch'; filas 'Sesión activa' de canales ROT y FaceSearch — Textos truncados visibles: 'Proyecto: wt-paneles-ma...', 'rg-facesearch-sentinel....', 'rot-tel...' y 'facesear...' cortados sin tooltip/expandir.
- **[cosmetica]** sidebar izquierdo, lista de proyectos, fila 'probe-cwd' — La fila 'probe-cwd' no lleva icono inicial mientras el resto de filas sí, rompiendo la alineación vertical de los iconos.
- **[cosmetica]** barra superior derecha, junto a 'EN VIVO' — Botón/icono de estado (~24x24) muy pequeño y pegado al borde derecho, con target mínimo apenas visible junto al indicador EN VIVO.

## prod/desktop-dark/agents
Vista de inspector de Agentes en ExoHuman UI: barra lateral izquierda con navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Voz, proyectos, árbol FILES, Settings), barra superior con acciones de sesión y área principal con 3 tarjetas de agente (dev, exohuman-ui, rot) más un panel plegable 'Catálogo de skills (80)'. Tema oscuro, sin loader ni error.

- **[friccion]** barra lateral izquierda, bloque de proyectos (filas 'Proyecto: ...') — 'Proyecto: wt-paneles-ma...' está truncado con puntos suspensivos; el nombre real del proyecto no se puede leer sin interactuar.
- **[friccion]** barra lateral izquierda, entre 'Proyecto: wt-explorer' y el encabezado 'FILES' — Hay una fila/elemento recortado a media altura: solo se ven los topes de letras cortadas, el contenido queda oculto por overflow del contenedor.
- **[friccion]** barra superior, extremo derecho (esquina superior derecha) — Un icono aparece cortado/pegado al borde del viewport, a medio mostrar junto al borde de la ventana.
- **[cosmetica]** tarjetas de agente (dev / exohuman-ui / rot), esquina derecha — El chevron de plegar/desplegar es un control muy pequeño y aislado en el borde derecho, difícil de localizar y con área de clic reducida.
- **[cosmetica]** barra lateral, fila 'probe-cwd' en la lista de proyectos — 'probe-cwd' no lleva icono mientras el resto de filas de proyecto sí, rompiendo la consistencia visual de la lista.
- **[cosmetica]** barra lateral, contadores de 'Proyecto: wt-paneles-ma...' y 'Proyecto: wt-poststudio-v2' (dígito '0') — Los contadores '0' tienen muy bajo contraste sobre el fondo oscuro y casi no se distinguen del fondo.

## prod/desktop-dark/encargos
Vista Encargos con sidebar izquierdo de navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, proyectos y árbol FILES) y panel principal con header 'Encargos y Objetivos', filtros por pestañas/área y 5 tarjetas de encargos en curso con badges de estado, dificultad y área, metadatos a la derecha y CTA 'Ir a sesión de trabajo'.

- **[friccion]** Tarjetas de encargos, lado derecho (centro del panel principal) — El botón 'Ir a sesión de trabajo' solo aparece en las 2 primeras tarjetas; las 3 tarjetas inferiores (Inventario, QA visual, Mejora recursiva) no tienen ninguna acción visible, lo que rompe la consistencia y deja encargos sin navegación.
- **[cosmetica]** Sidebar izquierdo, lista de proyectos (parte media-inferior) — El nombre 'Proyecto: wt-paneles-ma...' está truncado con puntos suspensivos y convive con un badge numérico '1' justo al lado, dificultando identificar el proyecto completo.
- **[friccion]** Tarjetas de encargos, subtítulo bajo el título — 4 de 5 tarjetas muestran el mismo texto genérico 'Iniciando investigación...' sin progreso ni ETA, dando sensación de placeholder y sin información real del estado del encargo.
- **[cosmetica]** Tarjetas de encargos, esquina superior derecha (metadatos) — La línea de metadatos ('Llevan 2m enc-6d8067e1') es gris muy tenue sobre fondo oscuro y amontona duración e ID sin separador claro, apenas legible a este tamaño.

## prod/desktop-dark/home
Vista raíz oscura con sidebar izquierdo (secciones de actividad, árbol de sesiones/proyectos y panel FILES) y área principal centrada con logo/versiones, breadcrumb de workspace y composer de nueva sesión con barra de controles inferior.

- **[friccion]** Sidebar > FILES > pestañas de archivos (parte superior izquierda, bajo FILES · 25) — Las dos pestañas muestran texto truncado roto por la izquierda: aparecen como '.._human-ui' y '.._egrador 12' en lugar de los nombres completos, ilegibles e identificables solo por el badge.
- **[friccion]** Sidebar > lista de sesiones/proyectos (árbol exohuman-ui) — El nombre del proyecto 'Proyecto: wt-paneles-ma…' se trunca sin tooltip visible, quedando imposible distinguirlo de otro posible proyecto con el mismo prefijo.
- **[cosmetica]** Composer > barra de controles inferior del input (fila derecha) — Controles 'auto', 'configured', 'Compact' y el icono de volumen están apilados muy juntos con iconos pequeños y texto mínimo, sin separación clara entre grupos semánticos (modo / estado / vista / audio).
- **[cosmetica]** Sidebar > barra de herramientas de FILES (fila de iconos junto a 'FILES · 25') — Seis iconos de acción (cerrar, colapsar, subir, refrescar, ojo, buscar) de ~12px muy comprimidos y con poca separación, targets difíciles de pulsar incluso en desktop.
- **[cosmetica]** Barra superior > extremo derecho (parte superior de la captura) — El icono de panel queda pegado al borde derecho del viewport sin margen de aire respecto al resto de la topbar.

## prod/desktop-dark/paneles
Vista de sesión/agente en vez de la galería de Paneles: sidebar izquierdo (navegación, proyectos, árbol FILES), área central con mensaje largo del agente, chips de archivos y barra de input; barra superior con métricas. La vista Paneles entregables no llega a renderizarse.

- **[bloqueante]** área principal central — Con ?view=paneles se espera la galería de paneles entregables pero se muestra el hilo de una sesión con texto markdown del agente: la vista solicitada no carga o no existe ruta real para ella.
- **[friccion]** sidebar izquierdo, lista de proyectos — Nombre truncado 'Proyecto: wt-paneles-ma...' sin tooltip ni expansión visible; el contador '1' queda suelto al lado del texto cortado.
- **[friccion]** contenido del mensaje, parte superior del área central — El texto del agente aparece cortado por el borde superior ('proceso pi-web.js reiniciado):') sin respiro de scroll ni separador claro con la barra superior.
- **[cosmetica]** barra superior derecha, métricas — Agrupación de métricas '243k ↑ 85k ↓ 26.5M ⊙ 18% / 1.0M' muy comprimida y sin etiquetas claras de qué representan cada valor.
- **[cosmetica]** sidebar, lista de proyectos — Entrada 'probe-cwd' sin icono de proyecto ni contexto, mezclada con los 'Proyecto: wt-...' rompiendo la consistencia visual de la lista.

## prod/desktop-dark/post-studio
La vista (?view=post-studio) no muestra el Post Studio: se ve la sesión de chat con un informe numerado de cambios, sidebar izquierdo con Actividad/Línea de tiempo/Agentes/Workspaces/Encargas/Decisiones, panel FILES con árbol de carpetas y barra de mensaje inferior.

- **[bloqueante]** Panel central principal — La vista solicitada es Post Studio (carrusel de posts) pero se renderiza la conversación de sesión con el resumen de implementación; no hay controles ni datos de post/carrusel en ningún punto de la pantalla.
- **[cosmetica]** Barra superior derecha (System/Tools) — La etiqueta 'Tools' queda parcialmente recortada por el botón toggle de panel del borde derecho; el control se amontona contra el borde.
- **[cosmetica]** Sidebar izquierdo, lista de proyectos — Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma... 0') sin tooltip ni forma de ver el nombre completo.

## prod/desktop-dark/proposals
Vista de detalle de una decisión en tema oscuro: sidebar izquierdo de navegación + árbol de archivos 'FILES', y área principal con tarjeta de propuesta (estado, origen, descripción, 3 opciones A/B/C, textarea de respuesta personalizada y botón enviar).

- **[cosmetica]** header superior izquierdo, tab del logo 'Exohuman UI' — El texto del logo aparece recortado por arriba y se solapa con el botón de cierre (x) del tab; la pestaña parece cortada en el borde superior del viewport.
- **[friccion]** sidebar izquierdo, lista de 'Proyecto:' (wt-paneles-ma..., wt-poststudio-v2) — Los nombres de proyecto se truncan con puntos suspensivos sin tooltip ni ancho suficiente ('Proyecto: wt-paneles-ma...') y los contadores '0 1' quedan amontonados pegados al nombre truncado.
- **[friccion]** sidebar izquierdo, límite inferior de la lista de proyectos, justo encima del divisor 'FILES' — Hay un elemento de la lista cortado a media línea (se ve solo la parte superior del texto) por overflow del contenedor, sin scroll visible ni indicación de que hay más contenido.
- **[friccion]** parte inferior del área principal, botón 'Enviar respuesta' — El botón queda pegado y parcialmente cortado por el borde inferior del viewport; el contenedor de 'Respuesta personalizada' no tiene margen/padding inferior suficiente.
- **[cosmetica]** fila 'Origen' de la tarjeta, chip 'Brief matutino · 20-10' — El texto del chip se ve comprimido/truncado dentro del recuadro gris y con bajo contraste respecto al resto de la fila 'Origen'.
- **[cosmetica]** barra de filtros superior derecha, botón icono junto al desplegable 'Por urgencia / caducidad' — El último botón de la barra queda casi pegado al borde derecho de la ventana, sin margen lateral, y su icono es poco identificable.

## prod/desktop-dark/session-scrolled
Vista de sesión con sidebar izquierdo (nav, proyectos, árbol de FILES), área principal con mensaje largo renderizado en markdown, barra superior con acciones y métricas, y footer con input de mensaje, chips de archivos y controles secundarios.

- **[cosmetica]** Sidebar izquierdo, lista de proyectos — Los nombres se truncan con puntos suspensivos ('Proyecto: wt-paneles-ma...') y los contadores '0' y '1' quedan sueltos al final sin explicación visual clara.
- **[cosmetica]** Sidebar izquierdo, cabecera del panel FILES — El rótulo aparece cortado ('FILE...') y la fila de iconos de acciones (explorar, carpeta, upload, download, ojo, +, search) va muy apretada contra él, sin separación ni tooltips visibles.
- **[cosmetica]** Barra superior derecha, métricas (243k / 85k / 26.5M / 18%/1.0M) — Indicadores de tokens/uso en tipografía muy pequeña y sin etiquetas, difíciles de interpretar de un vistazo.
- **[cosmetica]** Footer inferior, fila de controles junto a 'Failover Fast' — Controles 'off', 'configured', 'Compact' e iconos (imagen, micrófono, volumen) amontonados sin separación ni jerarquía, con targets pequeños y poco etiquetados.

## prod/desktop-dark/session
Vista de sesión de chat con sidebar izquierdo (navegación principal, proyectos y árbol FILES) y área central de mensajes con respuesta larga del agente, chips de archivos, footer con estado y barra de entrada de mensaje. Tema oscuro, layout de tres zonas con panel derecho colapsado.

- **[cosmetica]** Sidebar izquierdo, lista de proyectos (mitad superior) — Los nombres de proyecto quedan truncados con puntos suspensivos ('Proyecto: wt-paneles-ma…', 'Proyecto: wt-poststudio-v2'), impidiendo identificar el proyecto sin hover
- **[friccion]** Panel FILES, cabecera (barra de iconos junto a 'FILES') — Los 6-7 iconos de acciones (subir, carpeta, subir archivo, toggle, ojo, +, lupa) están muy apretados y son de tamaño muy reducido (~14px), con separación mínima entre ellos: difícil de clicar y propenso a errores
- **[friccion]** Barra inferior central (footer bajo la zona de chat) — Controles 'Failover Fast', 'off', 'configured', 'Compact' y dos iconos de audio apilados a la derecha en texto pequeño (~11px), con jerarquía confusa: no queda claro cuáles son acciones, cuáles son estados y qué significa 'off'
- **[cosmetica]** Borde derecho, altura ~860px (icono de candado/panel) — El icono de toggle del panel derecho aparece pegado y parcialmente cortado contra el borde de la ventana, casi ilegible como control
- **[cosmetica]** Área de mensaje del agente, parte superior del contenido — El mensaje del agente arranca a media frase ('proceso pi-web.js reiniciado):') sin cabecera ni contexto visible del inicio del bloque, dando sensación de contenido cortado al cargar la vista

## prod/desktop-dark/timeline
Vista Timeline (desktop 1440x900, tema oscuro): barra superior con acciones, sidebar izquierdo con navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisions, Hablar por Voz), árbol de proyectos/files y panel principal con cabecera, chips de filtros por tipo, buscador y eventos agrupados por día (Mié 21 Oct, Jue 22 Oct, Vie 23 Oct).

- **[cosmetica]** Sidebar izquierdo, sección proyectos (Mitad izquierda) — Los nombres de proyecto se truncan con puntos suspensivos ('Proyecto: wt-paneles-ma…') mientras otros caben completos, rompiendo la escaneabilidad de la lista.
- **[cosmetica]** Sidebar izquierdo, líneas de proyecto ('Proyecto: wt-paneles-ma…' y 'Proyecto: wt-poststudio-v2') — Los dos badges numéricos (0 y 1) con iconos van pegados al texto y entre sí, apelotonados al final de la línea y muy cerca del borde derecho del sidebar.
- **[cosmetica]** Panel central, eventos de timeline (descripciones de los 'caduca:') — Las descripciones de los eventos ocupan 2-3 líneas de texto gris apretado en cada fila, generando filas muy altas y densas frente a las rutinas de una sola línea, con jerarquía poco clara entre título y detalle.
- **[cosmetica]** Panel central, metadatos de eventos ('01:30 · programada', '09:00 · ocio · pendiente' etc.) — Texto secundario en gris muy oscuro sobre fondo oscuro con contraste bajo, difícil de leer sobre todo en las líneas de estado/hora.
- **[cosmetica]** Barra superior (Full history, Generate title, System, Tools) y toolbar FILES — Controles agrupados muy juntos con iconos pequeños y sin separación clara entre acciones de barra superior; los iconos del toolbar FILES son blancos muy pequeños, difícil de distinguir su función.

## prod/desktop-light/home
Home de ExoHuman UI en desktop 1440x900: sidebar izquierdo con módulos (Actividad, Timeline, Agentes, Workspaces, Encargos, Decisiones), listado de sesiones y explorador FILES, y área principal con logo, breadcrumb y composer de nueva sesión.

- **[friccion]** sidebar izquierdo, bloque de sesiones (junto a 'exohuman-ui') — Estado contradictorio: dice 'No sessions yet' pero justo debajo aparecen 2 sesiones ('Proyecto: wt-paneles-ma…' y 'Proyecto: wt-poststudio-v2'); el texto vacío no se oculta al haber datos.
- **[cosmetica]** sidebar, listado de sesiones — Nombres de sesión truncados con puntos suspensivos ('Proyecto: wt-paneles-ma…'), el título completo no es legible ni hay tooltip visible.
- **[friccion]** explorador FILES, fila de pestañas/chips bajo los iconos — Los chips de archivos están cortados a mitad de palabra ('__human-ui', 'k_grador 12') y se solapan entre sí, indicando overflow horizontal sin scroll ni degradación clara.
- **[cosmetica]** explorador FILES, fila de iconos de acción — 7 iconos de acción (folder, upload, refresh, link, eye, history, search) muy apretados en ~200px, con targets pequeños y sin separación clara.
- **[cosmetica]** barra superior derecha, 'Full history' y 'Generate title' — Controles en gris muy claro con contraste apenas legible respecto al fondo, parecen deshabilitados sin estado alternativo explicativo.
- **[cosmetica]** área principal, columna inferior del composer (texto 'Failover Normal (Default)' y controles de la derecha) — Controles del pie del composer (auto, configured, Compact, volumen) muy dispersos y en gris de bajo contraste, jerarquía confusa frente al input principal.

## prod/desktop-light/post-studio
Vista de sesión/timeline de agente (no Post Studio): sidebar izquierdo con navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Hablar por voz), árbol FILES debajo; panel central con respuesta de agente en lista numerada, chips de archivos y barra de input de mensaje con acciones.

- **[friccion]** panel central / zona de contenido — La vista capturada no es Post Studio (?view=post-studio): se muestra el timeline de sesión con documento de texto, no el carrusel de posts solicitado.
- **[cosmetica]** sidebar izquierdo, lista de proyectos — Nombre truncado 'Proyecto: wt-paneles-ma...' sin tooltip visible, y badge '1' pegado al texto truncado, lo que dificulta distinguir el proyecto real.
- **[cosmetica]** panel central, chips de archivos bajo la respuesta — Chips de nombres de archivo (p.ej. session-activity.test.mjs) muy estrechos respecto a su contenido, con el texto recortado/al límite del pill.
- **[cosmetica]** cabecera FILES del sidebar — Fila de 6 iconos de acción (nuevo, carpeta, subir, ver, copiar, buscar) muy apretados, objetivos táctiles pequeños y sin espacio entre ellos.
- **[cosmetica]** parte superior del panel central — El texto continúa cortado por el borde superior de la zona de scroll ('...proceso pi-web.js reiniciado):'), indicando corte de contenido no resaltado.

## prod/desktop-light/proposals
Vista de propuesta de decisión (panel derecho) con barra superior de filtros y sidebar izquierdo con navegación, lista de proyectos y explorador de archivos. La propuesta muestra título, descripción, 3 opciones A/B/C y un formulario de respuesta con textarea y botón Enviar.

- **[friccion]** sidebar izquierdo, lista de Proyectos justo encima del panel FILES — La última fila de la lista de proyectos está cortada a la mitad: solo se ve el chevron/icono y el texto queda oculto tras el header 'FILES' (el contenedor desborda y no hace clip limpio).
- **[cosmetica]** sidebar izquierdo, ítem 'Proyecto: wt-paneles-ma...' — Nombre del proyecto truncado con puntos suspensivos, no se distingue de 'wt-poststudio-v2' al lado; útil tener título completo o tooltip.
- **[cosmetica]** barra superior derecha, botón a la derecha del desplegable 'Por urgencia / caducidad' — El botón está cortado por el borde derecho del viewport: solo se ve una fracción del contenido ('V...'), da sensación de desbordamiento horizontal de la barra de filtros.
- **[cosmetica]** botón 'Enviar respuesta' (esquina inferior derecha del formulario) — Contraste muy bajo: fondo azul muy lavado con texto casi blanco, cuesta distinguir si está deshabilitado o es el estilo definitivo.

## prod/desktop-light/session
Vista de sesión con sidebar izquierdo (navegación, lista de proyectos y explorador FILES), área central de chat con mensaje largo de contenido técnico y footer con input de mensaje y barra de estado.

- **[friccion]** Sidebar izquierdo, sección de proyectos (ítems "Proyecto: wt-paneles-ma..." y "Proyecto: wt-poststudio-v2") — Los nombres de proyecto se truncan con puntos suspensivos sin tooltip ni indicación de nombre completo; el nombre real del proyecto no es legible ("wt-paneles-ma...").
- **[cosmetica]** Sidebar izquierdo, fila "Hablar por Voz" / botón "ROT Live" — El botón verde saturado "ROT Live" compite visualmente con el badge "en vivo" de Actividad y con los badges de contadores, aportando ruido cromático a la jerarquía del sidebar.

## prod/desktop-light/timeline
Vista Timeline en desktop 1440x900 con tema claro: barra superior de herramientas, sidebar izquierdo (Actividad, navegación, proyectos, árbol FILES) y panel principal con chips de filtro, buscador y lista de eventos agrupados por fecha (PRÓXIMO 19).

- **[cosmetica]** Sidebar izquierdo, entradas de proyecto (ej. 'Proyecto: wt-paneles-ma...', 'Proyecto: wt-poststudio-v2', 'Proyecto: wt-explorer') — El nombre del proyecto se trunca con puntos suspensivos y no se ve completo; el contador '0 1' queda pegado al texto truncado sin separación clara.
- **[cosmetica]** Lista de eventos, delante del texto 'caduca:' (4 eventos: Coworking & Founder Meetup, Cruz Novillo, Watcher Spotify, Cineteca Matadero) — Aparece un glifo '⨯' suelto delante de 'caduca:' que parece un emoji/icono no renderizado o carácter roto; inconsistente con el resto de iconos de la lista.
- **[cosmetica]** Cabeceras de grupo de fecha (Mié 21 Oct / Jue 22 Oct / Vie 23 Oct), número de eventos a la derecha (5, 3, 1) — El contador del grupo está pegado al borde derecho de la ventana, casi sin margen, mientras los eventos tienen padding lateral visible; la alineación rota la retícula del panel.
- **[cosmetica]** Sidebar izquierdo, sección FILES (barra de iconos . ↻ ⬆ ⬇ ◎ ⌄ + y campo de búsqueda) — Los iconos de acción del árbol de archivos son muy pequeños y están muy apretados entre sí, con un campo de búsqueda mínimo debajo; targets difíciles de pulsar con precisión.
- **[cosmetica]** Sidebar izquierdo, ítem 'Línea de tiempo' con etiqueta 'pasado → próximo' — El título ocupa dos líneas y la etiqueta lateral queda muy comprimida junto al borde del ítem, generando un aspecto apretado frente a los demás ítems de una sola línea.

## prod/mobile-dark/encargos
Vista de Encargos en móvil con cabecera, título grande, filtros por estado y área, y una lista de tarjetas de encargos con badges de estado/dificultad, metadatos, título, descripción y acciones.

- **[friccion]** barra de acciones superior, lado derecho (botón 'Cerrar') — El botón 'Cerrar' queda cortado por el borde derecho de la pantalla: hay overflow horizontal y no se ve completo ni es pulsable en su totalidad.
- **[friccion]** chips de metadatos en las tarjetas (columna derecha: 'enc-...' y 'Llevan X') — Los textos se parten a media palabra en dos líneas ('enc-' / '6d867e1', 'Llevan' / '1m'), rompiendo el identificador del encargo y dificultando la lectura rápida.
- **[cosmetica]** título 'Encargos y Objetivos' + fila superior — El título ocupa tres líneas y empuja la fila de controles ('5 activos', '197 total', 'Actualizar', 'Cerrar') hacia la derecha, provocando el amontonamiento y el corte del último botón.
- **[cosmetica]** tarjetas de la lista (esquina inferior de las tarjetas 1 y 3) — Solo la tarjeta central muestra el botón 'Ir a sesión de trabajo'; las demás no tienen acción visible, lo que rompe la consistencia de las tarjetas.

## prod/mobile-dark/home
Vista home móvil en tema oscuro: barra superior con menú, 'Session info' y toggle de panel; zona central ampliamente vacía con bloque de marca 'Exohuman UI' + breadcrumb de workspace/rama y composer de nueva sesión con controles debajo.

- **[friccion]** Fila de breadcrumb bajo el título (a la derecha, borde derecho de la pantalla) — El selector de rama se muestra truncado por la izquierda ('...paneles-manager') y su chevron queda pegado al borde derecho del viewport, con la fila casi desbordada en 390px.
- **[friccion]** Input del composer (lado derecho del placeholder) — El placeholder 'Message... Type / for commands, @' aparece truncado con puntos suspensivos justo donde explica el comando '@', perdiendo información útil en móvil.
- **[friccion]** Barra de controles inferior del composer (fila de iconos + 'Failover Normal' + 'More controls') — El texto 'Failover Normal (Defa…' está truncado con elipsis; en 390px esa fila queda amontonada entre iconos, selector de failover y 'More controls'.
- **[cosmetica]** Zona superior-centro de la pantalla (todo el hueco por encima del título) — Más del 35% de la pantalla está en blanco sin contenido ni estado (sin lista de sesiones visible ni indicación de estado), dejando el layout desequilibrado con todo el contenido agrupado en el centro.
- **[cosmetica]** Barra superior: texto 'Session info' y placeholder del input — Contraste muy bajo del gris sobre el fondo oscuro ('Session info' y el placeholder apenas se distinguen del fondo).
- **[friccion]** Barra superior (botón '...' y toggle de panel) y fila de controles del composer (iconos de imagen/micro/ajustes) — Targets táctiles de icono con apariencia por debajo de 44px en móvil, difíciles de tocar con precisión.

## prod/mobile-dark/paneles
Vista de mensaje en hilo de sesión (contenido tipo devlog con código, chips de archivos y zona de input inferior) en móvil 390x844 y tema oscuro, con barra superior de estado y controles inferiores.

- **[friccion]** parte superior del contenido de texto, bajo la barra de estado — El primer párrafo aparece cortado a media línea ('pasos, cada relativa y Nueva sesión aquí...') sin espacio de respiro respecto a la barra superior: texto truncado/pegado al borde superior.
- **[friccion]** zona de metadatos justo bajo los chips de archivos (derecha/centro) — Aparece la letra 'R' suelta en su propia línea, suelta del resto de metadatos ('522 in · 1,078 out · 191,936 cache'), probablemente texto cortado o que salta de forma errónea.
- **[cosmetica]** campo de mensaje inferior (placeholder) — El placeholder 'Message... Type / for commands, @' termina en '@' sin cerrar, aparentemente truncado dentro del ancho disponible.
- **[friccion]** contenido principal de la vista (?view=paneles) — La vista se supone una galería de paneles entregables pero se muestra el cuerpo de un mensaje de sesión con chips de archivos; no se ve ningún panel/galería ni cabecera de la vista.

## prod/mobile-dark/post-studio
Vista Post Studio en móvil 390x844 (tema oscuro): mensaje largo de sesión con texto, chips de archivos referenciados, línea de metadatos de tokens/fecha y barra inferior con input de mensaje y controles rápidos.

- **[friccion]** línea de metadatos bajo los chips de archivos (parte baja del contenido) — El pie de metadatos hace wrap roto: 'Oct 15 03:13 PM' se parte en dos líneas y queda una 'R' huérfana suelta en línea propia, aspecto de desborde/reflow mal gestionado.
- **[cosmetica]** parte superior del contenido del mensaje — La primera línea de texto queda cortada a media altura pegada al borde superior (bajo la barra de estado), el texto empieza a 'pasos, cada relativa y Nueva sesión aqu…' sin margen ni separación visible.
- **[cosmetica]** input de mensaje (parte inferior) — El placeholder 'Message... Type / for commands, @' tiene contraste muy bajo respecto al fondo del input y el texto es largo, ocupando casi todo el ancho disponible.
- **[cosmetica]** barra inferior de controles (iconos izquierda) — Los iconos de adjuntar/imagen, micrófono y ajustes son pequeños (~32-36px) y están muy juntos entre sí y respecto a 'Failover Fast', apretados en el borde inferior en móvil.

## prod/mobile-dark/proposals
Vista de Decisiones en móvil 390x844 con tema oscuro: barra superior, filtros de estado (Pendientes/Todas/urgencia), chips de categoría, y una propuesta del SISTEMA con descripción y opciones A-D en tarjetas apiladas.

- **[bloqueante]** barra de filtros de estado, extremo derecho (botón 'Por urgen') — El botón de urgencia se desborda fuera del viewport: se corta el texto ('Por urgen') y no hay indicación de scroll horizontal visible, parte del control es inaccesible.
- **[friccion]** varias: título de la propuesta ('▯ Paneles actuales'), chips de filtro ('Pendientes'/'Todas'), toggle superior derecho — Los iconos renderizan como caracteres tofu (▯ / cuadrado hueco) por faltante de glifo/emoji en la fuente del navegador móvil, dejando cajas vacías en toda la interfaz.
- **[friccion]** fila de Origen: enlace 'Ver sesión en vivo' (derecha del chip) — El enlace se parte en dos líneas ('Ver sesión en' / 'vivo') junto al icono de enlace externo, quedando un target táctil apretado y desalineado respecto al chip de origen.
- **[cosmetica]** opción A (tarjeta A) — El texto se corta con asterisco ('sidebar-*') sin ellipsis ni indicación de que hay más contenido; la descripción queda incompleta sin forma evidente de verla completa.
- **[cosmetica]** parte inferior (opción D visible a medias) — La última tarjeta aparece cortada por el borde inferior sin separación visual clara de fin de lista, pudiendo confundirse con un desbordamiento.

## prod/mobile-dark/session
Vista móvil de una sesión con mensajes de chat en tema oscuro: barra superior con menú/estadísticas, cuerpo con listado numerado, párrafo 'Calidad', chips de archivos y meta de tokens; abajo campo de mensaje con barra de acciones.

- **[cosmetica]** zona meta del mensaje (justo encima del input, izquierda) — Aparece una 'R' suelta en una línea propia bajo '522 in · 1,078 out · 191,936 cache', con la fecha 'Oct 15 03:13 PM' partida en dos líneas: etiqueta de rol/autor truncada y wrap incorrecto del timestamp.
- **[friccion]** primer mensaje visible en la parte superior del scroll (bajo la barra superior) — El texto queda recortado contra el borde derecho: 'Nueva sesión aqu' se corta a media palabra, indicando overflow/clip horizontal o solape con la barra fija.
- **[cosmetica]** barra de acciones inferior (Failover Fast / More controls) — Acciones en texto plano en la esquina inferior derecha con poco aire respecto al borde y sin separación clara respecto a los iconos (imagen/micro/ajustes) de la misma fila, jerarquía confusa en móvil.

## prod/mobile-dark/sidebar-open
Móvil 390x844 en tema oscuro con el sidebar abierto como drawer sobre el contenido de la sesión: barra superior con contadores (85k/18%), secciones principales (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz), lista larga de proyectos/instancias y botón Settings anclado abajo; detrás se ve el panel de la conversación recortado.

- **[friccion]** lista de proyectos en el sidebar (filas 'Proyecto: wt-pan...', 'wt-pos...', 'wt-resilie...', 'wt-seccio...', 'wt-timelin...', 'wt-panele...', 'wt-remot...') — Nombres de proyecto truncados con puntos suspensivos a ~390px; varios empiezan igual (wt-pan..., wt-pane..., wt-panele...) y quedan indistinguibles sin posibilidad de ver el nombre completo.
- **[cosmetica]** filas de proyecto en el sidebar (glifo antes del texto) — Aparece un glifo cuadrado vacío (tofu / icono no renderizado) en lugar del icono del proyecto en varias filas, mientras 'probe-cwd' no tiene icono y 'Rutina: reconcile' sí.
- **[cosmetica]** borde derecho del drawer: contenido de la sesión detrás del sidebar — No hay scrim/oscurecimiento ni cierre visual: el contenido detrás queda a la misma luminosidad y cortado a media palabra/línea, lo que resta foco al menú abierto.
- **[cosmetica]** cada fila de proyecto: botones '+' y '⋯' a la derecha — Los controles por fila son estrechos y están muy juntos entre sí y respecto al texto truncado, apretando el row en 390px.

## prod/mobile-dark/timeline
Vista Timeline móvil en tema oscuro: barra superior con menú, título 'Línea de tiempo' (659 eventos) y botón de cierre, fila de chips de filtro (Todos/Encargos/Decisiones/...) desplazable, campo de búsqueda y lista cronológica agrupada por fecha con rutinas y eventos con descripción larga expandida.

- **[friccion]** fila de chips de filtro, borde derecho (fila 2 de la captura) — El cuarto chip se corta contra el borde derecho de la pantalla sin indicador de scroll (solo se ve parte de un icono ⚠ truncado), lo que da sensación de overflow horizontal y oculta filtros existentes.
- **[friccion]** evento 'caduca: Exploración de planes: Coworking & Founder Meetup...', Mié 21 Oct — La descripción del evento se muestra íntegramente sin truncar/colapsar (~10 líneas de texto), dominando la lista y empujando el resto de eventos fuera de pantalla; no hay 'ver más' ni clamp de líneas.
- **[cosmetica]** mismo evento 'caduca', línea de título y meta — Doble icono de casilla/checkbox duplicado al inicio ('▫▫ caduca') y repetición redundante de la fecha ('Miércoles 21-oct' en la descripción cuando ya está bajo el grupo 'Mié 21 Oct'), ruidando la jerarquía.
- **[cosmetica]** barra superior, 'Session info' y botón de panel (esquina superior derecha) — 'Session info' en gris azulado sobre fondo oscuro con contraste bajo y muy pegado al botón de panel/cerrar de la derecha, separación mínima entre targets táctiles.

## prod/mobile-light/home
Home móvil con topbar (menú, 'Session info', toggle de panel) y bloque de composer anclado en la mitad-inferior: logo/versión 'Exohuman UI v1.0.0 · pi v1.2.0', breadcrumbs de workspace/branch, input de mensaje con envío y fila de controles (imagen, mic, failover, 'More controls'). El resto de la pantalla está vacío y no se ve la lista de sesiones.

- **[friccion]** breadcrumbs (fila de workspace/branch, derecha) — '...paneles-managerr' llega pegado al borde derecho sin padding y su chevron queda cortado en el edge: texto truncado y desborde horizontal del contenedor de breadcrumbs.
- **[friccion]** fila de controles bajo el composer — 'Failover Normal (Defa...' aparece truncado con puntos suspensivos en el selector de modo de failover, ilegible sin abrir el desplegable.
- **[friccion]** zona central del home — Enorme vacío vertical (~500-600px) entre el topbar y el bloque del composer sin ninguna lista de sesiones ni estado vacío guiado (ni CTA ni texto): estado vacío pobre y jerarquía confusa en home.
- **[cosmetica]** controles del composer (iconos imagen/micrófono) — Iconos de adjuntar imagen y micrófono de tamaño táctil muy reducido (~20-24px) respecto al resto de la fila, difíciles de tocar en móvil.

## prod/mobile-light/post-studio
La vista ?view=post-studio muestra en realidad un mensaje de agente (changelog de sesiones) con chips de archivos, metadata de tokens, campo de input y barra inferior de controles; no se ve el estudio de posts/carrusel esperado.

- **[bloqueante]** contenido principal / toda la pantalla — La vista Post Studio no muestra el estudio de posts ni carrusel: se renderiza un chat de agente con un changelog, por lo que la ruta o el enrutado de la vista está roto (contenido no correspondiente a la vista solicitada).
- **[friccion]** línea de metadata inferior del mensaje ('522 in · 1,078 out · 191,936 cache R') y fecha 'Oct 15 03:13 PM' — Ambos textos se rompen en dos líneas con salto feo (la 'R' suelta y la fecha 'PM' en línea propia), rompiendo la alineación con el resto del mensaje.
- **[friccion]** barra inferior flotante ('Failover Fast' / 'More controls') sobre la metadata del mensaje — El elemento 'Failover Fast' solapa visualmente la 'R' partida de la línea de metadata; el contenido queda tapado por la barra inferior.
- **[cosmetica]** barra inferior de controles (icono imagen, micrófono, engranaje, 'Failover Fast', 'More controls') — Controles mezclados sin jerarquía: iconos pequeños a la izquierda junto a dos etiquetas de texto; 'Failover Fast' no tiene contenedor ni borde y los targets táctiles de los iconos son pequeños (<40px) para móvil.
- **[cosmetica]** chips de archivos (SessionSidebar.tsx, route.ts, etc.) — Los chips se apilan en dos columnas irregulares con anchos muy dispares, generando un bloque visual desordenado en móvil.

## prod/mobile-light/proposals
Vista de Decisiones en móvil: barra superior con menú y 'Session info', fila de filtros (Volver, Pendientes/Todas/Por urgencia) y chips de categoría, seguida de una tarjeta de propuesta del SISTEMA con título grande, badge de origen, enlace a sesión en vivo, descripción en caja y opciones A/B/C como tarjetas apiladas.

- **[friccion]** fila de filtros bajo la barra superior, extremo derecho — El filtro 'Por urgen…' se corta en el borde derecho de la pantalla: desbordamiento horizontal del contenedor de tabs sin scroll visible ni indicación de que hay más opciones.
- **[cosmetica]** tabs 'Pendientes (13)', 'Todas (104)' y filtro 'Por urgen…' — Los iconos de los tabs se renderizan como cuadrados vacíos (glifo faltante / tofu), lo que da sensación de interfaz rota.
- **[cosmetica]** badge 'Origen: Brief matutino · 20-10', línea inferior de la cabecera de la propuesta — El texto del badge parte la fecha '20-10' en dos líneas ('20-' / '10') por ancho insuficiente, rompiendo la lectura del dato.

## prod/mobile-light/session
Vista de sesión en móvil con mensaje largo del agente (lista numerada, chips de archivos referenciados, metadatos del turno) y barra inferior con input de mensaje, botones de adjuntar/micrófono/ajustes y enlaces 'Failover Fast'/'More controls'; barra superior con menú, stats de tokens y toggle de panel.

- **[cosmetica]** cabecera superior + primera línea del contenido — El texto del mensaje queda cortado a media línea justo bajo la barra superior ('pasos, cada relativa y Nueva sesión aqu'), sin separación ni desvanecido, da sensación de truncado.
- **[friccion]** metadatos del turno, justo encima del input — La línea '522 in · 1,078 out · 191,936 cache R' hace wrap dejando una 'R' sola en la línea siguiente; el corte del texto es ilegible/accidental.
- **[cosmetica]** fecha del turno, esquina inferior derecha del mensaje — 'Oct 15 03:13 PM' se parte en dos líneas ('Oct 15 03:13' / 'PM'), wrap feo en una marca de tiempo.
- **[friccion]** barra inferior, fila de controles bajo el input — 'Failover Fast' y 'More controls' son texto plano sin borde ni fondo ni icono, no tienen affordance de botón y quedan flotando en la parte derecha, junto a los iconos de adjuntar/micrófono/ajustes.
- **[cosmetica]** input de mensaje, borde derecho — El placeholder 'Message... Type / for commands, @' llega muy pegado al botón de envío, casi sin margen de seguridad.
- **[cosmetica]** metadatos del turno (522 in · 1,078 out · cache) — Texto en gris muy claro sobre fondo blanco, contraste bajo para información de contexto.

## prod/mobile-light/sidebar-open
Vista móvil 390x844 con sidebar abierto en overlay: barra superior de iconos, tarjetas de navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz) y lista larga de proyectos/rutinas con acciones + y …; el contenido principal queda atenuado detrás.

- **[friccion]** Sidebar > lista de proyectos (fila 'Proyecto: wt-pan…', 'wt-pos…', 'wt-resilie…', 'wt-seccio…', 'wt-timelin…', 'wt-paneles…', 'wt-remot…') — Nombres de proyecto truncados con '...' de forma masiva: varios ítems quedan casi idénticos ('wt-pan...' vs 'wt-paneles...') y no se distinguen entre sí; no hay tooltip ni segunda línea que muestre el nombre completo.
- **[friccion]** Sidebar > filas de proyecto, botones '+' y '…' (derecha de cada fila) — Targets táctiles pequeños (aprox. 28-30px) y muy juntos entre sí, con apenas separación: riesgo alto de toque erróneo en móvil, además el '…' queda pegado al borde derecho del sidebar.
- **[cosmetica]** Barra superior global, zona central-izquierda (entre el icono de carpeta y el '+') — Existe una celda vacía ancha sin contenido que ocupa espacio útil, mientras que a la derecha los controles (búsqueda, '↓ 85k 18%', toggle de panel) van apretados en 390px: la barra está desequilibrada.
- **[cosmetica]** Tarjeta 'Línea de tiempo', texto secundario 'pasado → próximo' (derecha de la tarjeta) — Contraste bajo: gris muy claro sobre fondo blanco, apenas legible a tamaño pequeño en móvil.

## prod/mobile-light/timeline
Timeline móvil con header (título, 662 eventos), chips de filtro con scroll horizontal, buscador y lista agrupada por fecha bajo el separador PRÓXIMO, con rutinas programadas y eventos con descripciones larguísimas.

- **[friccion]** fila de chips de filtro (debajo del header, borde derecho) — El cuarto chip (con icono de aviso) aparece cortado a la derecha, a media anchura; se lee como chip roto y obliga a scroll horizontal para ver su etiqueta.
- **[cosmetica]** iconos de cada evento de la lista (columna izquierda) y prefijo de eventos 'caduca' — Los iconos/emojis no renderizan correctamente: se ven como cuadrados huecos (tofu), p.ej. '□ □ caduca: ...', sin significado visual alguno.
- **[friccion]** evento 'caduca: Exploración de planes: Coworking & Founder Meetup...' (Mié 21 Oct) — La descripción ocupa ~10 líneas de texto seguido en gris, domina toda la pantalla y entierra el resto del timeline; no hay clamp/colapsar 'ver más', la jerarquía título↔detalle queda aplastada.
- **[cosmetica]** fila superior (top bar, derecha) — 'Session info' está en inglés dentro de una UI en español; mezcla de idioma en la navegación.

## prod/tablet-dark/home
Vista raíz en tablet 820x1180, tema oscuro: sidebar izquierdo con navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz), lista de sesiones con árbol de FILES y Settings abajo; zona principal casi vacía con hero 'Exohuman UI', selectores de workspace/fork, composer de mensaje y fila de controles de sesión.

- **[friccion]** sidebar, tarjeta de navegación 'Línea de tiempo' — El título 'Línea de tiempo' se parte en dos líneas y el descriptor 'pasado → próximo' también envuelve, rompiendo la altura uniforme de las tarjetas de navegación respecto a las demás.
- **[friccion]** sidebar, lista de sesiones — Los nombres de sesión se truncan con puntos suspensivos ('Proyecto: wt-paneles-ma...'), impidiendo identificar la sesión sin hover/expandir.
- **[friccion]** sidebar, lista de sesiones, estado 'No sessions yet' — Estado vacío pobre: solo texto gris pequeño sin acción ni ayuda ('No sessions yet' sin botón para crear sesión ni indicación de qué hacer).
- **[friccion]** zona principal, parte superior — Gran hueco vacío entre la barra superior y el bloque del hero/composer (contenido centrado verticalmente), dejando ~40% de la pantalla en blanco sin estado ni guía.
- **[cosmetica]** zona principal, fila de controles bajo el composer — Controles amontonados en una sola línea (iconos imagen/micrófono, 'Failover Normal (Default)', 'auto', 'configured', 'Compact') con iconos pequeños poco diferenciados y sin agrupación clara.
- **[cosmetica]** sidebar, árbol FILES — Árbol de archivos muy extenso que empuja 'Settings' al fondo y obliga a scroll largo; la sección ocupa más altura que la lista de sesiones, desequilibrando el panel.

## prod/tablet-dark/post-studio
La vista muestra una sesión de agente con sidebar izquierdo (Actividad, Timeline, Agentes, Workspaces, Encargos, Decisiones, proyectos), panel central con texto técnico de dev-log, chips de archivos y barra de mensaje, y barra superior de acciones. No se ve el Post Studio/carrusel de posts esperado.

- **[bloqueante]** área central / global de la vista — La URL indica ?view=post-studio pero se renderiza una vista de sesión/chat de agente con explorador de FILES; no aparece el estudio de posts ni el carrusel de redes.
- **[friccion]** barra superior derecha (Tools, panel de sistema) — Los controles del topbar se desbordan: 'Tools' queda pegado al borde, aparece un texto truncado 'OM' y el icono de panel está cortado/pegado al borde derecho de la ventana.
- **[cosmetica]** sidebar izquierdo, lista de proyectos — Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma...', 'Proyecto: wt-poststudio-v2...'), impidiendo identificarlos sin hover.
- **[cosmetica]** panel central, parte superior — El contenido empieza a mitad de una lista de bullets cortada por el borde superior, sin contexto visible del inicio del mensaje.

## prod/tablet-dark/proposals
Vista de decisiones en tablet: rail izquierdo con navegación, árbol FILES y lista de proyectos; panel derecho con detalle de la decisión 'Tarjeta del token-governor', opciones A/B/C, respuesta personalizada con dictado y paginación (1 de 13).

- **[friccion]** Todo el rail izquierdo y cabecera del panel derecho (iconos de 'Línea de tiempo', 'Agentes', badges 'Pendientes'/'Todas', checks de la lista de 'Proyecto:' y delante de 'Respuesta personalizada') — Múltiples iconos renderizan como cuadrados vacíos (tofu □): la fuente de iconos no carga o el glifo no existe, dejando marcas sin significado en navegación, filtros y listas.
- **[friccion]** Rail izquierdo, primer elemento de la lista de proyectos: 'Proyecto: wt-paneles-ma... ○1' — Nombre de proyecto truncado con puntos suspensivos y el contador '○1' pegado al final sin espacio, dando sensación de texto cortado y datos incompletos.
- **[cosmetica]** Botón 'Enviar respuesta', esquina inferior derecha del formulario de respuesta — El texto del botón aparece gris apagado sobre fondo azul verdoso (estado deshabilitado), con contraste muy bajo y aspecto de control inactivo aunque la acción es la principal de la tarjeta.
- **[cosmetica]** Barra superior de filtros, extremo derecho junto al desplegable 'Por urgencia / caducidad' — El botón icono del final queda cortado/pegado al borde derecho de la ventana, casi sin margen, y su glifo se ve parcial recortado.
- **[cosmetica]** Paginación inferior central: 'Decisión 1 de 13' — Texto gris muy tenue sobre fondo oscuro, poco legible frente a los botones 'Anterior'/'Siguiente' que sí tienen contraste suficiente.

## prod/tablet-dark/session
Vista de sesión en tema oscuro: barra superior con acciones (Full history, Generate title, Branches, System, Tools), sidebar izquierdo de navegación + explorador de FILES, y panel central de chat con mensaje largo de texto técnico, chips de archivos referenciados, input de mensaje y barra inferior de controles.

- **[friccion]** barra superior, extremo derecho (top-right) — El contador de agentes 'N/M' aparece cortado/clipped contra el borde derecho y solapado por el icono de panel: la barra de acciones desborda horizontalmente en tablet y el último elemento queda ilegible.
- **[cosmetica]** sidebar izquierdo, lista de Proyectos — Nombres de proyecto truncados con elipsis ('Proyecto: wt-paneles-ma...') sin tooltip visible, lo que impide identificar el workspace completo.
- **[cosmetica]** panel de chat, zona inferior antes del input — Los chips de archivos referenciados se apilan en 4 filas muy pegadas al campo de mensaje y al icono de envío, dejando la última fila ('SessionSidebar.test.mjs', 'route.ts') casi pegada al input sin separación clara.

## prod/tablet-dark/timeline
Vista Timeline con sidebar izquierdo (nav, lista de proyectos, árbol FILES, Settings) y panel principal con cabecera, pestañas de filtros, buscador y eventos agrupados por fecha (Mié 21 Oct a Sáb 24 Oct) con descripciones largas. Todo en tema oscuro, sin estado vacío ni errores visibles.

- **[friccion]** fila de chips de filtro (Todos/Encargos/Decisiones/Fallos/Informes), parte superior del panel derecho — La fila de pestañas se desborda: el chip 'Informes 1…' queda cortado en el borde derecho sin affordance de scroll ni indicación de más opciones, en viewport 820px
- **[cosmetica]** sidebar izquierdo, lista de proyectos (sección bajo 'Hablar por Voz') — Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma…') sin tooltip ni forma de ver el nombre completo
- **[friccion]** sidebar izquierdo, item 'Línea de tiempo' — El texto descriptivo 'pasado → próximo' se parte en dos líneas y el título 'Línea de tiempo' también ocupa dos líneas, dejando el item desalineado respecto al resto de la navegación
- **[cosmetica]** cabecera global superior derecha (iconos de toggle/paneles) — Los iconos de la barra superior son pequeños y muy apretados entre sí, con targets táctiles apenas visibles para tablet
- **[cosmetica]** eventos de timeline (tarjetas con checkbox cuadrado a la izquierda) — Los checkboxes de cada evento son iconos pequeños y muy juntos al texto, con target táctil reducido y sin padding de interacción claro

## prod/tablet-light/home
Home de ExoHuman UI: sidebar izquierdo con tarjetas de navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Voz), lista de sesiones/proyectos y árbol de FILES; zona principal con toolbar superior, logo+versión, selectores de workspace/fork, composer con Send y fila de controles.

- **[cosmetica]** sidebar, lista de sesiones, fila 'Proyecto: wt-paneles-ma...' — Nombre del proyecto truncado con puntos suspensivos ('wt-paneles-ma...') sin tooltip visible ni badge de sesiones completo a la derecha.
- **[friccion]** sidebar, fila 'Proyecto: wt-paneles-sesiones' — El texto llega al borde derecho del sidebar y queda cortado sin elipsis ni indicación de contenido oculto; se solapa con el límite del panel.
- **[cosmetica]** toolbar superior, botones 'Full history' y 'Generate title' — Etiquetas con contraste muy bajo (texto grisáceo sobre fondo claro), parecen deshabilitadas pero no hay estado hover ni indicador claro.
- **[cosmetica]** FILES, pestañas de workspace '..human-ui' y '..egrador 12' — Nombres truncados con prefijo '..' (p.ej. '..egrador 12'), difícil identificar el workspace al que corresponden.
- **[cosmetica]** sidebar, sesión 'exohuman-ui' con 'No sessions yet' — Estado vacío 'No sessions yet' en inglés mientras el resto de la UI está en español, y sin acción sugerida (CTA) para crear la primera sesión.
- **[friccion]** composer, fila de controles bajo el input (iconos imagen/micrófono) — Targets de los iconos de imagen y micrófono pequeños (~24-28px) y muy separados del resto de controles ('Failover Normal (Default)', 'auto', 'configured', 'Compact'), que quedan dispersos en toda la anchura.
- **[cosmetica]** toolbar superior, iconos junto al logo (+, actividad, filtro, buscar, panel) — Grupo de 5 iconos sin etiqueta ni separación clara respecto a los botones con texto, jerarquía poco evidente en tablet.

## prod/tablet-light/post-studio
Vista de sesión/agente con chat: barra superior con pestañas, sidebar izquierdo con navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones), árbol de FILES y área central con un documento markdown largo (informe de cambios UI), archivos adjuntos y barra de input de mensaje abajo. No se muestra la vista Post Studio peticionada, sino contenido de una sesión de agente.

- **[friccion]** área central completa (viewport 820x1180) — La vista cargada no corresponde a Post Studio (?view=post-studio): se muestra un documento markdown de sesión/agentes con lista de cambios de UI, no carruseles ni editor de posts de redes.
- **[friccion]** barra superior derecha (tabs: Tools, ...M) — Desbordamiento horizontal del header: los últimos elementos quedan cortados en el borde derecho ('...M' a medias), indicando overflow de la tira de pestañas/herramientas.
- **[friccion]** sidebar izquierdo, lista de proyectos (Proyecto: wt-paneles-ma...) — Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma...') sin tooltip ni expansión visible, y badge 'C 1' pegado al texto truncado.
- **[cosmetica]** sidebar izquierdo, ítem 'Línea de tiempo' — Texto secundario 'pasado → próximo' en gris claro sobre fondo blanco con bajo contraste, apenas legible.
- **[cosmetica]** barra inferior de estados (Failover Fast, off, configured, Compact) — Iconos de acciones (imagen, micrófono, volumen) muy pequeños y juntos en la barra inferior, con targets táctiles difíciles de pulsar en tablet.
- **[cosmetica]** área central, chips de archivos adjuntos (bottom: route.ts, SessionSidebar.test.mjs) — Los chips de archivos se solapan con el borde superior del campo de mensaje, quedando parcialmente ocultos detrás del input.

## prod/tablet-light/proposals
Vista de Decisiones con sidebar de navegación (Actividad, proyectos, FILES) y panel derecho con tarjeta de propuesta: cabecera con pestañas Pendientes/Todas, filtros de categoría, opciones A/B/C, textarea de respuesta con dictado y paginación inferior.

- **[friccion]** Múltiples zonas: sidebar 'Línea de tiempo' y 'Agentes', pestañas 'Pendientes (12)' y 'Todas (104)', dropdown 'Por urgencia / caducidad', checkbox junto a 'Respuesta personalizada' — Iconos/glifos que renderizan como cajas vacías (tofu): se pierde el significado del icono y da sensación de UI rota, especialmente en las pestañas de estado y en el checkbox (parece un control sin renderizar).
- **[cosmetica]** Sidebar, lista de proyectos: primer elemento 'Proyecto: wt-paneles-ma...' — Nombre de proyecto truncado con puntos suspensivos, mientras el badge '1' queda pegado al final; sin indicación visual de que hay tooltip/tooltip que revele el nombre completo.
- **[cosmetica]** Sidebar, item 'Línea de tiempo' (arriba a la izquierda) — La etiqueta se parte en dos líneas ('Línea de / tiempo') rompiendo el ritmo vertical frente al resto de items de una sola línea; el item queda más alto y desalineado.
- **[cosmetica]** Panel derecho, fila de metadatos 'hace 8 horas' tras el badge SISTEMA — Texto en gris muy claro sobre fondo blanco: contraste bajo, apenas legible en tablet con brillo medio.

## prod/tablet-light/session
Vista de sesión con panel izquierdo (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, árbol de FILES) y área central de chat con mensajes largos, chips de archivos referenciados, composer abajo y barra de estado inferior. Vista con datos, sin loader ni error.

- **[friccion]** barra superior derecha (Full history / Generate title / Branches / System / Tools) — La barra de pestañas desborda por la derecha: el último elemento aparece cortado ('M') a mitad y el botón de menú queda pegado al borde de la ventana, sin margen.
- **[friccion]** chips de archivos debajo del mensaje, justo encima del composer — La última fila de chips (SessionSidebar.test.mjs, route.ts) queda parcialmente tapada/cortada por el campo de mensaje; la flecha indicadora se solapa con el borde del composer y route.ts se ve cortado.
- **[cosmetica]** panel izquierdo, lista de proyectos — El nombre 'Proyecto: wt-paneles-ma…' se trunca con puntos suspensivos sin tooltip visible ni forma de ver el nombre completo.
- **[cosmetica]** área de chat, primer mensaje visible (arriba) — El contenido del mensaje empieza cortado ('Canales ROI / Voz / FaceSearch…' sin viñeta inicial completa), indicando scroll intermedio con el inicio del mensaje fuera de vista.

## prod/tablet-light/timeline
Sidebar izquierdo con navegación (Actividad, Línea de tiempo, Agentes, Workspaces, Encargos, Decisiones, Hablar por Voz, lista de Proyectos/Rutinas, árbol FILES y Settings) y panel derecho con la vista Timeline: cabecera con 663 eventos, fila de filtros por tipo, buscador y tarjetas de eventos agrupadas por día (Mié 21 Oct a Sáb 24 Oct) con títulos y descripciones largas.

- **[friccion]** Panel derecho, fila de filtros por tipo de evento (cerca del borde derecho) — El chip 'Informes 1...' queda cortado en el borde del viewport: la fila de pestañas desborda horizontalmente sin scroll ni degradado visible que indique que hay más filtros ocultos.
- **[friccion]** Panel derecho, tarjetas de eventos 'caduca: ...' (bloques de descripción en gris) — Las descripciones largas se renderizan en gris muy claro sobre fondo gris claro, con contraste muy bajo y párrafos densos de 5-6 líneas que hacen la timeline ilegible de un vistazo.
- **[friccion]** Sidebar, lista de proyectos y filas de eventos (iconos delante del texto) — Los iconos se dibujan como glifos cuadrados huecos (tofu/sustituto) en 'Proyecto: wt-...', 'Rutina: reconcile', 'probe-cwd' y en cada fila de evento ('▯ Rutina:', '▯ ▯ caduca:'), sugiriendo iconos rotos o fallback de fuente.
- **[cosmetica]** Sidebar, ítem 'Proyecto: wt-paneles-ma...' (primer proyecto de la lista) — El nombre del proyecto se trunca con puntos suspensivos sin tooltip visible y además el badge de contador se solapa visualmente con el final del texto truncado.
- **[cosmetica]** Sidebar, tarjeta 'Línea de tiempo' con 'pasado → próximo' — El título se parte en dos líneas ('Línea de / tiempo') y la etiqueta 'pasado → próximo' también, quedando un bloque muy apretado y con línea base desalineada respecto al icono.

## Vistas vacías / sin datos
- pre/desktop-dark/home
- pre/desktop-light/timeline
- pre/tablet-dark/timeline

---

# Ranking global (frecuencia × severidad)

Total issues: 333 en 78 capturas. Severidades: bloqueante=5, friccion=131, cosmetica=197.

1. **[friccion] ×5** — sidebar izquierdo, item 'Línea de tiempo': El texto del label se parte en dos líneas ('Línea de' / 'tiempo') rompiendo la altura y alineación de los items de navegación respecto al resto.
   - ej: pre/desktop-dark/agents
   - ej: pre/desktop-dark/encargos
   - ej: prod/desktop-light/timeline
2. **[friccion] ×4** — fila de controles bajo el composer: selector de failover: Etiqueta truncada 'Failover Normal (Defa…' sin poder saber el valor real ('Default…') en móvil; falta de ancho o de tooltip/abreviación clara.
   - ej: pre/mobile-dark/home
   - ej: pre/mobile-dark/home
   - ej: pre/mobile-light/home
3. **[friccion] ×3** — evento 'caduca: Exploración de planes: Coworking & Founder Meetup…' (bloque Mié 21 Oct, mitad inferior): La descripción se vuelca completa en el timeline (párrafo de ~10 líneas sin clamp ni colapso), rompe el ritmo de escaneo de la lista y empuja el resto de eventos fuera de pantalla.
   - ej: pre/mobile-light/timeline
   - ej: prod/mobile-dark/timeline
   - ej: prod/mobile-light/timeline
4. **[friccion] ×2** — sidebar izquierdo, lista de proyectos: Nombre truncado 'Proyecto: wt-paneles-ma...' sin tooltip ni expansión visible; el contador '1' queda suelto al lado del texto cortado.
   - ej: prod/desktop-dark/paneles
   - ej: prod/desktop-light/post-studio
5. **[bloqueante] ×1** — área principal central: Con ?view=paneles se espera la galería de paneles entregables pero se muestra el hilo de una sesión con texto markdown del agente: la vista solicitada no carga o no existe ruta real para ella.
   - ej: prod/desktop-dark/paneles
6. **[bloqueante] ×1** — Panel central principal: La vista solicitada es Post Studio (carrusel de posts) pero se renderiza la conversación de sesión con el resumen de implementación; no hay controles ni datos de post/carrusel en ningún punto de la pantalla.
   - ej: prod/desktop-dark/post-studio
7. **[cosmetica] ×3** — Sidebar izquierdo, lista de proyectos: Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma... 0') sin tooltip ni forma de ver el nombre completo.
   - ej: prod/desktop-dark/post-studio
   - ej: prod/tablet-dark/post-studio
   - ej: prod/tablet-dark/session
8. **[bloqueante] ×1** — barra de filtros de estado, extremo derecho (botón 'Por urgen'): El botón de urgencia se desborda fuera del viewport: se corta el texto ('Por urgen') y no hay indicación de scroll horizontal visible, parte del control es inaccesible.
   - ej: prod/mobile-dark/proposals
9. **[bloqueante] ×1** — contenido principal / toda la pantalla: La vista Post Studio no muestra el estudio de posts ni carrusel: se renderiza un chat de agente con un changelog, por lo que la ruta o el enrutado de la vista está roto (contenido no correspondiente a la vista solicitada).
   - ej: prod/mobile-light/post-studio
10. **[bloqueante] ×1** — área central / global de la vista: La URL indica ?view=post-studio pero se renderiza una vista de sesión/chat de agente con explorador de FILES; no aparece el estudio de posts ni el carrusel de redes.
   - ej: prod/tablet-dark/post-studio
11. **[friccion] ×1** — tarjeta FaceSearch (canales principales, centro-arriba): El nombre del servicio 'rg-facesearch-sentinel....' y el id de sesión 'faceear...' aparecen truncados con puntos suspensivos; no se puede identificar el servicio ni la sesión.
   - ej: pre/desktop-dark/activity
12. **[friccion] ×1** — tarjeta ROT (canales principales, centro-arriba): El enlace de sesión activa se muestra truncado como 'rot-tel..', cortando el nombre de la sesión antes de 'Abrir sesión →'.
   - ej: pre/desktop-dark/activity
13. **[friccion] ×1** — 3 tarjetas (Post Studio v2, Gestor de paneles, Mejora recursiva) — línea de descripción: Las tres muestran el mismo texto genérico 'Iniciando investigación...' pese a llevar 8-12 min activas; el estado no informa de progreso real y parece placeholder estancado.
   - ej: pre/desktop-dark/encargos
14. **[friccion] ×1** — Sidebar izquierdo, sección FILES: chips de breadcrumb de carpetas (fila '.xohuman-ui | .udio-v2 12'): Los nombres de las carpetas están truncados sin elipsis coherente: aparece '.xohuman-ui' (faltan letras del inicio) y '.udio-v2' (debería ser 'post-studio-v2'), el usuario no puede identificar el workspace/fork seleccionado.
   - ej: pre/desktop-dark/home
15. **[friccion] ×1** — fila Origen, chip 'Auditoría enc-955f7fdd · 20-10' (centro-superior): El identificador/fecha se parte en dos líneas ('20-' / '10') dentro del chip, con corte a mitad de dato, aspecto de texto truncado o mal envuelto.
   - ej: pre/desktop-dark/proposals
16. **[friccion] ×1** — enlace 'Ver sesión en vivo' junto al chip de Origen (centro-superior): El enlace se envuelve en dos líneas ('Ver sesión en' / 'vivo') rompiendo la alineación horizontal de la fila Origen; el contenedor es demasiado estrecho.
   - ej: pre/desktop-dark/proposals
17. **[cosmetica] ×2** — barra superior derecha (métricas: 243k, ↑85k, 26.5M, 18% / 1.0M): Etiquetas numéricas muy pequeñas y en gris poco contrastado, sin unidades/labels claras que expliquen qué representa cada cifra (jerarquía confusa).
   - ej: pre/desktop-dark/session
   - ej: prod/desktop-dark/session-scrolled
18. **[friccion] ×1** — área de chat, parte superior del mensaje visible: El mensaje aparece cortado por arriba (empieza a mitad de frase: "proceso pi-web.js reiniciado):") sin cabecera de mensaje visible (autor, timestamp, acciones), lo que dificulta ubicar el inicio y contexto del contenido.
   - ej: pre/desktop-dark/session
19. **[friccion] ×1** — panel principal — descripciones de eventos (filas 'caduca: ...' en Mié 21 Oct, Jue 22 Oct): El texto de detalle va en gris muy apagado sobre fondo oscuro (#6-7 gris vs #0f172a), contraste bajo para lectura de párrafos largos de 3-4 líneas; es la información más densa de la vista y la más difícil de leer.
   - ej: pre/desktop-dark/timeline
20. **[friccion] ×1** — sidebar izquierdo, bloque de sesiones bajo 'exohuman-ui': Estado vacío pobre: solo 'No sessions yet' en gris pequeño, sin icono, explicación ni CTA para crear la primera sesión, y en inglés dentro de una UI en español
   - ej: pre/desktop-light/home
21. **[friccion] ×1** — composer central, barra inferior derecha: Controles 'auto', 'configured', 'Compact' y el icono de volumen amontonados con texto pequeño gris y apenas separación entre ellos, sin agrupación ni jerarquía clara
   - ej: pre/desktop-light/home
22. **[friccion] ×1** — sección 2 · Música, tarjeta B «Indie emotivo» (centro-derecha): Estado de reproducción inconsistente: el botón circular azul muestra icono de pausa pero la línea de estado dice «en pausa · 0:00 / 0:00 · loop», con duración 0:00/0:00 (sin pista cargada) y una barra de progreso vacía apenas visible.
   - ej: pre/desktop-light/post-studio
23. **[friccion] ×1** — área principal, tarjetas de opciones A–E: Las opciones se muestran como filas con badge de letra, pero no hay ningún control visible (botón/checkbox/enlace) para elegir, votar o descartar una opción; sólo texto, lo que deja la acción principal sin affordance visible.
   - ej: pre/desktop-light/proposals
24. **[friccion] ×1** — cabecera del panel principal, bajo 'Línea de tiempo': Persiste el texto 'cargando...' mientras el área de eventos queda en blanco sin skeleton ni mensaje de estado, dando sensación de loader eterno o carga colgada.
   - ej: pre/desktop-light/timeline
25. **[friccion] ×1** — sidebar izquierdo, entre el ítem 'Hablar por Voz' y la sección FILES: Aparece suelto el texto crudo 'Loading...' en inglés sin traducir ni contenedor, rompiendo la coherencia con el resto de la UI en español.
   - ej: pre/desktop-light/timeline
26. **[friccion] ×1** — área de contenido de la Timeline, debajo de la barra de búsqueda: Estado vacío sin contenido: no hay ilustración, ni copy de 'no hay eventos', ni CTA para crear el primer evento, dejando una zona blanca enorme junto al botón 'Añadir'.
   - ej: pre/desktop-light/timeline
27. **[friccion] ×1** — Cabecera superior derecha, fila de acciones (botones 'Actualizar' y 'Cerrar'): El botón 'Cerrar' queda cortado por el borde derecho de la pantalla: la fila de acciones desborda horizontalmente y el botón no se ve completo ni es tocable entero.
   - ej: pre/mobile-dark/encargos
28. **[friccion] ×1** — Cabecera junto al título: badge '5 activos' + contador '197 total': El badge '5 activos' queda aplastado entre el título y '197 total', con el texto partido en dos líneas ('5'/'activos') y '197 total' también envuelto en dos líneas; bloque de contadores apretado y de lectura confusa.
   - ej: pre/mobile-dark/encargos
29. **[friccion] ×1** — Fila de meta de cada tarjeta (derecha: 'Llevan 5m' e id 'enc-…'): En las tres tarjetas 'Llevan 5m' y el id se parten a mitad ('Llevan'/'5m', 'enc-'/'6d8067e1', 'enc-'/'ebe31041'), quedando guiones y números huérfanos con aspecto descuidado.
   - ej: pre/mobile-dark/encargos
30. **[friccion] ×1** — centro / mitad superior de la pantalla: Más de la mitad del viewport está en blanco: el bloque de marca + composer está verticalmente centrado dejando ~500px vacíos arriba y ~500px abajo, sin lista de sesiones visible ni ningún estado que ocupe la zona; la home se siente vacía y el contenido relevante queda desplazado hacia el tercio inferior.
   - ej: pre/mobile-dark/home
31. **[friccion] ×1** — fila de selectores, a la derecha del workspace: selector de rama/entorno: El texto aparece truncado por el borde izquierdo ('…eles-integrador') sin identificar el nombre completo; el truncado inicial rompe la lectura del elemento seleccionado.
   - ej: pre/mobile-dark/home
32. **[cosmetica] ×2** — barra superior derecha: texto 'Session info': Contraste bajo del label gris sobre fondo casi negro; poco legible en móvil y su función no queda clara junto al icono de panel.
   - ej: pre/mobile-dark/home
   - ej: pre/mobile-light/home
33. **[friccion] ×1** — cabecera Post Studio (parte superior, línea de título): El título queda truncado con elipsis ("Post Studio · La Herradura · Cum...") en 390px, no se ve el nombre completo del proyecto
   - ej: pre/mobile-dark/post-studio
34. **[friccion] ×1** — pestañas Carrusel/Reel y junto al título (iconos): Los iconos de las pestañas Carrusel y Reel y el icono previo al título se renderizan como glifos de sustitución (cuadrado vacío), indicando icono/emoji roto o ausente
   - ej: pre/mobile-dark/post-studio
35. **[friccion] ×1** — barra de filtros superior, extremo derecho: El botón 'Por urgen...' queda cortado por el borde del viewport: overflow horizontal visible, texto truncado y sin indicación de scroll (además el icono interior es un glifo roto).
   - ej: pre/mobile-dark/proposals
36. **[friccion] ×1** — pestañas 'Pendientes (7)' y 'Todas (106)' (centro-superior): Los iconos de las pestañas se renderizan como cajas tofu (□ / glifo faltante) en lugar de un emoji/icono, indicando fallo de renderizado de fuentes de símbolos.
   - ej: pre/mobile-dark/proposals
37. **[friccion] ×1** — tarjeta de opción A (abajo), badge 'A': El badge cuadrado 'A' está anclado abajo a la izquierda mientras el texto de la opción ocupa la parte superior: desalineación vertical rota entre badge y contenido.
   - ej: pre/mobile-dark/proposals
38. **[friccion] ×1** — barra inferior de controles, extremo derecho ('More controls'): El label 'More controls' queda pegado al borde derecho de la pantalla sin margen de seguridad, riesgo de recorte/overflow en 390px y sin padding lateral consistente respecto al resto de la barra.
   - ej: pre/mobile-dark/session
39. **[friccion] ×1** — árbol de workspaces, filas 'Proyecto: …' (mitad inferior del sidebar): Nombres de proyecto truncados con puntos suspensivos (wt-panele…, wt-postst…, wt-resilie…, wt-seccio…, wt-timelin…) lo que impide distinguirlos entre sí en móvil
   - ej: pre/mobile-dark/sidebar-open
40. **[friccion] ×1** — árbol de workspaces, botones '+' y '…' de cada fila: Targets táctiles pequeños y muy juntos (los tres puntos '…' y el '+'), por debajo del mínimo cómodo de ~44px en móvil
   - ej: pre/mobile-dark/sidebar-open
41. **[friccion] ×1** — fila de filtros (chips) bajo las pestañas, borde derecho: El cuarto chip (con icono de aviso) aparece cortado a la derecha: se ve solo su icono sin etiqueta ni indicador de scroll, por lo que no se entiende qué filtro existe ni que la fila es desplazable.
   - ej: pre/mobile-dark/timeline
42. **[friccion] ×1** — tarjeta de evento 'caduca: Exploración de planes: Coworking & Founder Meetup en Chamberí Café', sección Mié 21 Oct: La descripción se muestra íntegra sin colapsar (párrafo de ~8 líneas) y ocupa prácticamente media pantalla, empujando el resto del timeline y rompiendo el ritmo visual del listado; falta line-clamp o 'ver más'.
   - ej: pre/mobile-dark/timeline
43. **[friccion] ×1** — bloque breadcrumbs, a la derecha de 'workspaces/exohuman-ui': El nombre del agente/workspace aparece truncado por la izquierda ('...eles-integrador'): el usuario no puede identificar el elemento completo ni saber cuál está seleccionado.
   - ej: pre/mobile-light/home
44. **[friccion] ×1** — mitad superior de la pantalla (desde la barra superior hasta el logo): Zona enorme vacía sin contenido ni estado que la explique: el bloque útil queda amontonado en la parte baja, sin jerarquía ni indicación de qué hacer primero; además no se ve el sidebar de sesiones en móvil.
   - ej: pre/mobile-light/home
45. **[friccion] ×1** — cabecera, línea de título 'Post Studio · La Herradura · Cum...': El título queda truncado con 'Cum...' y no se puede ver el nombre completo del post sin opción de expandir.
   - ej: pre/mobile-light/post-studio
46. **[friccion] ×1** — fila de filtros superior (Pendientes/Todas) — borde derecho de la pantalla: El botón 'Por urgen…' queda cortado y desborda horizontalmente fuera del viewport 390px; no se ve completo ni hay indicador claro de scroll.
   - ej: pre/mobile-light/proposals
47. **[friccion] ×1** — Lista de proyectos del sidebar (mitad inferior): Los nombres de proyecto se truncan con puntos suspensivos sin espacio suficiente: 'wt-panele...', 'wt-postst...', 'wt-resilie...', 'wt-seccio...', 'wt-timelin...' quedan indistinguibles entre sí en móvil; no hay forma de ver el nombre completo ni tooltip visible.
   - ej: pre/mobile-light/sidebar-open
48. **[friccion] ×1** — Fila de proyectos del sidebar (derecha, columnas '+' y '...'): Los targets táctiles de '+' y el menú '...' son muy pequeños y están muy próximos entre sí en móvil, riesgo de tap accidental.
   - ej: pre/mobile-light/sidebar-open
49. **[friccion] ×1** — fila de filtros (chips) — borde derecho de la captura: El cuarto chip se corta contra el borde derecho (solo se ve el icono ⚠ a medio render) sin indicación de scroll ni degradado: overflow horizontal no comunicado.
   - ej: pre/mobile-light/timeline
50. **[friccion] ×1** — iconos de toda la interfaz (botón Añadir, pestañas Eventos/Patrones por hora, chips Encargos/Decisiones, iconos de cada fila de evento): Los iconos/emojis se renderizan como cuadrados vacíos (tofu □): glifo no disponible, iconografía ilegible y fea. En el evento 'caduca: Exploración de planes...' aparecen dos cuadrados seguidos.
   - ej: pre/mobile-light/timeline
51. **[friccion] ×1** — Sidebar izquierdo, lista de sesiones bajo 'Proyecto: wt-poststudio-v2': El nombre de sesión 'ENCARGO OFICIAL (enc-ebe3...' aparece truncado con puntos suspensivos, no se ve el identificador completo ni la fecha 'now' queda bien enlazada con el texto cortado.
   - ej: pre/tablet-dark/home
52. **[friccion] ×1** — Sidebar izquierdo, pestañas de la sección FILES: Los chips de pestañas muestran texto truncado: '..xohuman-ui' y '..udio-v2 12' (debería ser 'post-studio-v2'), el nombre del workspace/fork no se lee.
   - ej: pre/tablet-dark/home
53. **[friccion] ×1** — Sidebar global en viewport 820px: El sidebar ocupa más de la mitad del ancho (~520px de 820px), dejando el panel principal muy comprimido y generando una jerarquía invertida respecto a la vista de sesión.
   - ej: pre/tablet-dark/home
54. **[friccion] ×1** — Sidebar izquierdo, estado vacío 'exohuman-ui' > 'No sessions yet': Estado vacío solo con texto plano en gris, sin icono, explicación ni CTA para crear la primera sesión; además está en inglés en una UI mayoritariamente en español.
   - ej: pre/tablet-dark/home
55. **[friccion] ×1** — Panel derecho, tarjetas de música (A Rumba / B Indie emotivo): El texto de descripción se parte a una o dos palabras por línea (columna demasiado estrecha), ilegible: 'Rumba mediterránea con base moderna' y 'El sur, la terraza, la barbacoa...' ocupan un ancho mínimo con saltos de línea extremos.
   - ej: pre/tablet-dark/post-studio
56. **[friccion] ×1** — Panel derecho, tarjeta B · Indie emotivo (borde inferior): La tarjeta queda cortada por la barra inferior de acciones ('despedida' truncada y texto continuo oculto), obligando a scroll y con riesgo de perder contenido.
   - ej: pre/tablet-dark/post-studio
57. **[friccion] ×1** — Tarjeta 'Respuesta personalizada', parte superior derecha junto al botón 'Dictar audio': El botón 'Dictar audio' comprime el titular, que se parte en dos líneas con quiebre antinatural ('texto libre o nota / de voz):') y poco aire entre ambos
   - ej: pre/tablet-dark/proposals
58. **[friccion] ×1** — zona central, fila inferior de badges de archivos justo encima del input: La última fila de chips de archivos ('workspaces-data.ts', 'mobile-check.mjs') queda cortada/oculta tras la barra de mensaje: el contenido del mensaje se solapa o desborda bajo el input y no se puede ver completa sin scroll manual
   - ej: pre/tablet-dark/session
59. **[friccion] ×1** — panel derecho, fila de chips de filtro (horizontal, borde derecho): La fila de chips desborda: el chip 'Re...' queda cortado/clipped contra el borde derecho de la pantalla (viewport 820px) sin scroll horizontal visible ni degradado indicativo; se pierde acceso al resto de filtros.
   - ej: pre/tablet-dark/timeline
60. **[friccion] ×1** — sidebar ítems (Línea de tiempo, Paneles, Post Studio, Agentes...), pestañas Eventos/Patrones y botón Añadir: Los iconos se renderizan como cuadrados vacíos (tofu/glyph faltante) en lugar de su icono real: se pierde la señal visual de cada sección y el botón 'Añadir' muestra un cuadrado sin significado.
   - ej: pre/tablet-dark/timeline
61. **[friccion] ×1** — panel derecho, área de contenido central: Estado combinado confuso: el subtítulo dice 'cargando...' pero todos los chips muestran 0 y la zona queda en negro absoluto sin mensaje de vacío, ni loader, ni CTA; el usuario no sabe si sigue cargando o no hay datos.
   - ej: pre/tablet-dark/timeline
62. **[friccion] ×1** — sidebar izquierdo, sección de sesiones ('exohuman-ui'): El estado vacío de sesiones es sólo la línea 'No sessions yet' en gris claro, sin icono, explicación ni CTA para crear la primera sesión, además de convivir sin separación clara con el explorador de FILES justo debajo.
   - ej: pre/tablet-light/home
63. **[friccion] ×1** — sidebar, fila 'ENCARGO OFICIAL (enc-6d80...' del árbol de sesiones: El nombre del encargo aparece truncado con puntos suspensivos sin tooltip ni forma de ver el id completo (enc-6d80…), lo que impide identificar el encargo.
   - ej: pre/tablet-light/home
64. **[friccion] ×1** — zona principal (derecha), área entre topbar y hero/composer: En 820x1180 el hero y el composer flotan en el centro de una zona principal mayormente vacía (huecos grandes arriba y abajo), con el sidebar ocupando ~40% del ancho: en tablet la jerarquía queda confusa y el composer desperdicia espacio horizontal útil.
   - ej: pre/tablet-light/home
65. **[friccion] ×1** — columna derecha, tarjetas de música (A · Rumba y B · Indie emotivo): Las tarjetas son demasiado estrechas para el texto: la descripción se envuelve con 1-2 palabras por línea ("Rumba mediterránea con base moderna"), generando bloques verticales ilegibles y desperdicio de altura.
   - ej: pre/tablet-light/post-studio
66. **[friccion] ×1** — columna derecha, tarjeta B · Indie emotivo, parte inferior: El contenido de la tarjeta queda cortado/oculto tras la barra inferior fija ("despedida..." se corta a mitad de palabra): solape del footer con el contenido scrolleable, sin margen de respiro.
   - ej: pre/tablet-light/post-studio
67. **[friccion] ×1** — Opciones propuestas · opción B (centro de la captura): El texto queda truncado a media frase: 'Aprobar solo podas evidentes (Viper' sin cerrar el paréntesis ni mostrar elipsis/indicador de texto continuado; no se sabe si hay más contenido oculto.
   - ej: pre/tablet-light/proposals
68. **[friccion] ×1** — Sidebar navegación + pestañas superiores (Pendientes/Todas): Los iconos se renderizan como cuadrados vacíos (tofu/glyph faltante) en 'Línea de tiempo', 'Paneles', 'Post Studio', 'Agentes', 'Decisiones' y delante de 'Pendientes'/'Todas': iconografía rota en tema claro.
   - ej: pre/tablet-light/proposals
69. **[friccion] ×1** — barra superior derecha (topbar): El grupo de acciones se desborda: se ve un item cortado a 'OM' sin poder leerlo ni scrollear fácilmente en tablet.
   - ej: pre/tablet-light/session
70. **[friccion] ×1** — zona inferior del mensaje de chat (chips de archivos) sobre el input: La fila de chips 'workspaces-data.ts' y 'mobile-check.mjs' queda tapada/cortada por la barra de entrada de mensaje, sin margen de separación.
   - ej: pre/tablet-light/session
71. **[friccion] ×1** — Fila de chips de filtros de tipo de evento (bajo las pestañas), borde derecho del panel: La fila de chips se desborda horizontalmente: el chip 'Informes 1…' queda cortado en el borde derecho y parece haber más filtros ocultos sin scroll ni indicador visible.
   - ej: pre/tablet-light/timeline
72. **[friccion] ×1** — sidebar izquierdo, lista de proyectos (entre 'Proyecto: wt-explorer' y el header 'FILES'): La lista de proyectos se corta a mitad de fila: hay un elemento parcialmente visible recortado por el panel FILES, sin indicación clara de scroll (clipping vertical).
   - ej: prod/desktop-dark/activity
73. **[friccion] ×1** — barra lateral izquierda, bloque de proyectos (filas 'Proyecto: ...'): 'Proyecto: wt-paneles-ma...' está truncado con puntos suspensivos; el nombre real del proyecto no se puede leer sin interactuar.
   - ej: prod/desktop-dark/agents
74. **[friccion] ×1** — barra lateral izquierda, entre 'Proyecto: wt-explorer' y el encabezado 'FILES': Hay una fila/elemento recortado a media altura: solo se ven los topes de letras cortadas, el contenido queda oculto por overflow del contenedor.
   - ej: prod/desktop-dark/agents
75. **[friccion] ×1** — barra superior, extremo derecho (esquina superior derecha): Un icono aparece cortado/pegado al borde del viewport, a medio mostrar junto al borde de la ventana.
   - ej: prod/desktop-dark/agents
76. **[friccion] ×1** — Tarjetas de encargos, lado derecho (centro del panel principal): El botón 'Ir a sesión de trabajo' solo aparece en las 2 primeras tarjetas; las 3 tarjetas inferiores (Inventario, QA visual, Mejora recursiva) no tienen ninguna acción visible, lo que rompe la consistencia y deja encargos sin navegación.
   - ej: prod/desktop-dark/encargos
77. **[friccion] ×1** — Tarjetas de encargos, subtítulo bajo el título: 4 de 5 tarjetas muestran el mismo texto genérico 'Iniciando investigación...' sin progreso ni ETA, dando sensación de placeholder y sin información real del estado del encargo.
   - ej: prod/desktop-dark/encargos
78. **[friccion] ×1** — Sidebar > FILES > pestañas de archivos (parte superior izquierda, bajo FILES · 25): Las dos pestañas muestran texto truncado roto por la izquierda: aparecen como '.._human-ui' y '.._egrador 12' en lugar de los nombres completos, ilegibles e identificables solo por el badge.
   - ej: prod/desktop-dark/home
79. **[friccion] ×1** — Sidebar > lista de sesiones/proyectos (árbol exohuman-ui): El nombre del proyecto 'Proyecto: wt-paneles-ma…' se trunca sin tooltip visible, quedando imposible distinguirlo de otro posible proyecto con el mismo prefijo.
   - ej: prod/desktop-dark/home
80. **[friccion] ×1** — contenido del mensaje, parte superior del área central: El texto del agente aparece cortado por el borde superior ('proceso pi-web.js reiniciado):') sin respiro de scroll ni separador claro con la barra superior.
   - ej: prod/desktop-dark/paneles
81. **[friccion] ×1** — sidebar izquierdo, lista de 'Proyecto:' (wt-paneles-ma..., wt-poststudio-v2): Los nombres de proyecto se truncan con puntos suspensivos sin tooltip ni ancho suficiente ('Proyecto: wt-paneles-ma...') y los contadores '0 1' quedan amontonados pegados al nombre truncado.
   - ej: prod/desktop-dark/proposals
82. **[friccion] ×1** — sidebar izquierdo, límite inferior de la lista de proyectos, justo encima del divisor 'FILES': Hay un elemento de la lista cortado a media línea (se ve solo la parte superior del texto) por overflow del contenedor, sin scroll visible ni indicación de que hay más contenido.
   - ej: prod/desktop-dark/proposals
83. **[friccion] ×1** — parte inferior del área principal, botón 'Enviar respuesta': El botón queda pegado y parcialmente cortado por el borde inferior del viewport; el contenedor de 'Respuesta personalizada' no tiene margen/padding inferior suficiente.
   - ej: prod/desktop-dark/proposals
84. **[friccion] ×1** — Panel FILES, cabecera (barra de iconos junto a 'FILES'): Los 6-7 iconos de acciones (subir, carpeta, subir archivo, toggle, ojo, +, lupa) están muy apretados y son de tamaño muy reducido (~14px), con separación mínima entre ellos: difícil de clicar y propenso a errores
   - ej: prod/desktop-dark/session
85. **[friccion] ×1** — Barra inferior central (footer bajo la zona de chat): Controles 'Failover Fast', 'off', 'configured', 'Compact' y dos iconos de audio apilados a la derecha en texto pequeño (~11px), con jerarquía confusa: no queda claro cuáles son acciones, cuáles son estados y qué significa 'off'
   - ej: prod/desktop-dark/session
86. **[friccion] ×1** — sidebar izquierdo, bloque de sesiones (junto a 'exohuman-ui'): Estado contradictorio: dice 'No sessions yet' pero justo debajo aparecen 2 sesiones ('Proyecto: wt-paneles-ma…' y 'Proyecto: wt-poststudio-v2'); el texto vacío no se oculta al haber datos.
   - ej: prod/desktop-light/home
87. **[friccion] ×1** — explorador FILES, fila de pestañas/chips bajo los iconos: Los chips de archivos están cortados a mitad de palabra ('__human-ui', 'k_grador 12') y se solapan entre sí, indicando overflow horizontal sin scroll ni degradación clara.
   - ej: prod/desktop-light/home
88. **[friccion] ×1** — panel central / zona de contenido: La vista capturada no es Post Studio (?view=post-studio): se muestra el timeline de sesión con documento de texto, no el carrusel de posts solicitado.
   - ej: prod/desktop-light/post-studio
89. **[friccion] ×1** — sidebar izquierdo, lista de Proyectos justo encima del panel FILES: La última fila de la lista de proyectos está cortada a la mitad: solo se ve el chevron/icono y el texto queda oculto tras el header 'FILES' (el contenedor desborda y no hace clip limpio).
   - ej: prod/desktop-light/proposals
90. **[cosmetica] ×2** — botón 'Enviar respuesta' (esquina inferior derecha del formulario): Contraste muy bajo: fondo azul muy lavado con texto casi blanco, cuesta distinguir si está deshabilitado o es el estilo definitivo.
   - ej: prod/desktop-light/proposals
   - ej: prod/tablet-dark/proposals
91. **[friccion] ×1** — Sidebar izquierdo, sección de proyectos (ítems "Proyecto: wt-paneles-ma..." y "Proyecto: wt-poststudio-v2"): Los nombres de proyecto se truncan con puntos suspensivos sin tooltip ni indicación de nombre completo; el nombre real del proyecto no es legible ("wt-paneles-ma...").
   - ej: prod/desktop-light/session
92. **[friccion] ×1** — barra de acciones superior, lado derecho (botón 'Cerrar'): El botón 'Cerrar' queda cortado por el borde derecho de la pantalla: hay overflow horizontal y no se ve completo ni es pulsable en su totalidad.
   - ej: prod/mobile-dark/encargos
93. **[friccion] ×1** — chips de metadatos en las tarjetas (columna derecha: 'enc-...' y 'Llevan X'): Los textos se parten a media palabra en dos líneas ('enc-' / '6d867e1', 'Llevan' / '1m'), rompiendo el identificador del encargo y dificultando la lectura rápida.
   - ej: prod/mobile-dark/encargos
94. **[friccion] ×1** — Fila de breadcrumb bajo el título (a la derecha, borde derecho de la pantalla): El selector de rama se muestra truncado por la izquierda ('...paneles-manager') y su chevron queda pegado al borde derecho del viewport, con la fila casi desbordada en 390px.
   - ej: prod/mobile-dark/home
95. **[friccion] ×1** — Input del composer (lado derecho del placeholder): El placeholder 'Message... Type / for commands, @' aparece truncado con puntos suspensivos justo donde explica el comando '@', perdiendo información útil en móvil.
   - ej: prod/mobile-dark/home
96. **[friccion] ×1** — Barra de controles inferior del composer (fila de iconos + 'Failover Normal' + 'More controls'): El texto 'Failover Normal (Defa…' está truncado con elipsis; en 390px esa fila queda amontonada entre iconos, selector de failover y 'More controls'.
   - ej: prod/mobile-dark/home
97. **[friccion] ×1** — Barra superior (botón '...' y toggle de panel) y fila de controles del composer (iconos de imagen/micro/ajustes): Targets táctiles de icono con apariencia por debajo de 44px en móvil, difíciles de tocar con precisión.
   - ej: prod/mobile-dark/home
98. **[friccion] ×1** — parte superior del contenido de texto, bajo la barra de estado: El primer párrafo aparece cortado a media línea ('pasos, cada relativa y Nueva sesión aquí...') sin espacio de respiro respecto a la barra superior: texto truncado/pegado al borde superior.
   - ej: prod/mobile-dark/paneles
99. **[friccion] ×1** — zona de metadatos justo bajo los chips de archivos (derecha/centro): Aparece la letra 'R' suelta en su propia línea, suelta del resto de metadatos ('522 in · 1,078 out · 191,936 cache'), probablemente texto cortado o que salta de forma errónea.
   - ej: prod/mobile-dark/paneles
100. **[friccion] ×1** — contenido principal de la vista (?view=paneles): La vista se supone una galería de paneles entregables pero se muestra el cuerpo de un mensaje de sesión con chips de archivos; no se ve ningún panel/galería ni cabecera de la vista.
   - ej: prod/mobile-dark/paneles
101. **[friccion] ×1** — línea de metadatos bajo los chips de archivos (parte baja del contenido): El pie de metadatos hace wrap roto: 'Oct 15 03:13 PM' se parte en dos líneas y queda una 'R' huérfana suelta en línea propia, aspecto de desborde/reflow mal gestionado.
   - ej: prod/mobile-dark/post-studio
102. **[friccion] ×1** — varias: título de la propuesta ('▯ Paneles actuales'), chips de filtro ('Pendientes'/'Todas'), toggle superior derecho: Los iconos renderizan como caracteres tofu (▯ / cuadrado hueco) por faltante de glifo/emoji en la fuente del navegador móvil, dejando cajas vacías en toda la interfaz.
   - ej: prod/mobile-dark/proposals
103. **[friccion] ×1** — fila de Origen: enlace 'Ver sesión en vivo' (derecha del chip): El enlace se parte en dos líneas ('Ver sesión en' / 'vivo') junto al icono de enlace externo, quedando un target táctil apretado y desalineado respecto al chip de origen.
   - ej: prod/mobile-dark/proposals
104. **[friccion] ×1** — primer mensaje visible en la parte superior del scroll (bajo la barra superior): El texto queda recortado contra el borde derecho: 'Nueva sesión aqu' se corta a media palabra, indicando overflow/clip horizontal o solape con la barra fija.
   - ej: prod/mobile-dark/session
105. **[friccion] ×1** — lista de proyectos en el sidebar (filas 'Proyecto: wt-pan...', 'wt-pos...', 'wt-resilie...', 'wt-seccio...', 'wt-timelin...', 'wt-panele...', 'wt-remot...'): Nombres de proyecto truncados con puntos suspensivos a ~390px; varios empiezan igual (wt-pan..., wt-pane..., wt-panele...) y quedan indistinguibles sin posibilidad de ver el nombre completo.
   - ej: prod/mobile-dark/sidebar-open
106. **[friccion] ×1** — fila de chips de filtro, borde derecho (fila 2 de la captura): El cuarto chip se corta contra el borde derecho de la pantalla sin indicador de scroll (solo se ve parte de un icono ⚠ truncado), lo que da sensación de overflow horizontal y oculta filtros existentes.
   - ej: prod/mobile-dark/timeline
107. **[friccion] ×1** — breadcrumbs (fila de workspace/branch, derecha): '...paneles-managerr' llega pegado al borde derecho sin padding y su chevron queda cortado en el edge: texto truncado y desborde horizontal del contenedor de breadcrumbs.
   - ej: prod/mobile-light/home
108. **[friccion] ×1** — zona central del home: Enorme vacío vertical (~500-600px) entre el topbar y el bloque del composer sin ninguna lista de sesiones ni estado vacío guiado (ni CTA ni texto): estado vacío pobre y jerarquía confusa en home.
   - ej: prod/mobile-light/home
109. **[friccion] ×1** — línea de metadata inferior del mensaje ('522 in · 1,078 out · 191,936 cache R') y fecha 'Oct 15 03:13 PM': Ambos textos se rompen en dos líneas con salto feo (la 'R' suelta y la fecha 'PM' en línea propia), rompiendo la alineación con el resto del mensaje.
   - ej: prod/mobile-light/post-studio
110. **[friccion] ×1** — barra inferior flotante ('Failover Fast' / 'More controls') sobre la metadata del mensaje: El elemento 'Failover Fast' solapa visualmente la 'R' partida de la línea de metadata; el contenido queda tapado por la barra inferior.
   - ej: prod/mobile-light/post-studio
111. **[friccion] ×1** — fila de filtros bajo la barra superior, extremo derecho: El filtro 'Por urgen…' se corta en el borde derecho de la pantalla: desbordamiento horizontal del contenedor de tabs sin scroll visible ni indicación de que hay más opciones.
   - ej: prod/mobile-light/proposals
112. **[friccion] ×1** — metadatos del turno, justo encima del input: La línea '522 in · 1,078 out · 191,936 cache R' hace wrap dejando una 'R' sola en la línea siguiente; el corte del texto es ilegible/accidental.
   - ej: prod/mobile-light/session
113. **[friccion] ×1** — barra inferior, fila de controles bajo el input: 'Failover Fast' y 'More controls' son texto plano sin borde ni fondo ni icono, no tienen affordance de botón y quedan flotando en la parte derecha, junto a los iconos de adjuntar/micrófono/ajustes.
   - ej: prod/mobile-light/session
114. **[friccion] ×1** — Sidebar > lista de proyectos (fila 'Proyecto: wt-pan…', 'wt-pos…', 'wt-resilie…', 'wt-seccio…', 'wt-timelin…', 'wt-paneles…', 'wt-remot…'): Nombres de proyecto truncados con '...' de forma masiva: varios ítems quedan casi idénticos ('wt-pan...' vs 'wt-paneles...') y no se distinguen entre sí; no hay tooltip ni segunda línea que muestre el nombre completo.
   - ej: prod/mobile-light/sidebar-open
115. **[friccion] ×1** — Sidebar > filas de proyecto, botones '+' y '…' (derecha de cada fila): Targets táctiles pequeños (aprox. 28-30px) y muy juntos entre sí, con apenas separación: riesgo alto de toque erróneo en móvil, además el '…' queda pegado al borde derecho del sidebar.
   - ej: prod/mobile-light/sidebar-open
116. **[friccion] ×1** — fila de chips de filtro (debajo del header, borde derecho): El cuarto chip (con icono de aviso) aparece cortado a la derecha, a media anchura; se lee como chip roto y obliga a scroll horizontal para ver su etiqueta.
   - ej: prod/mobile-light/timeline
117. **[friccion] ×1** — sidebar, tarjeta de navegación 'Línea de tiempo': El título 'Línea de tiempo' se parte en dos líneas y el descriptor 'pasado → próximo' también envuelve, rompiendo la altura uniforme de las tarjetas de navegación respecto a las demás.
   - ej: prod/tablet-dark/home
118. **[friccion] ×1** — sidebar, lista de sesiones: Los nombres de sesión se truncan con puntos suspensivos ('Proyecto: wt-paneles-ma...'), impidiendo identificar la sesión sin hover/expandir.
   - ej: prod/tablet-dark/home
119. **[friccion] ×1** — sidebar, lista de sesiones, estado 'No sessions yet': Estado vacío pobre: solo texto gris pequeño sin acción ni ayuda ('No sessions yet' sin botón para crear sesión ni indicación de qué hacer).
   - ej: prod/tablet-dark/home
120. **[friccion] ×1** — zona principal, parte superior: Gran hueco vacío entre la barra superior y el bloque del hero/composer (contenido centrado verticalmente), dejando ~40% de la pantalla en blanco sin estado ni guía.
   - ej: prod/tablet-dark/home
121. **[friccion] ×1** — barra superior derecha (Tools, panel de sistema): Los controles del topbar se desbordan: 'Tools' queda pegado al borde, aparece un texto truncado 'OM' y el icono de panel está cortado/pegado al borde derecho de la ventana.
   - ej: prod/tablet-dark/post-studio
122. **[friccion] ×1** — Todo el rail izquierdo y cabecera del panel derecho (iconos de 'Línea de tiempo', 'Agentes', badges 'Pendientes'/'Todas', checks de la lista de 'Proyecto:' y delante de 'Respuesta personalizada'): Múltiples iconos renderizan como cuadrados vacíos (tofu □): la fuente de iconos no carga o el glifo no existe, dejando marcas sin significado en navegación, filtros y listas.
   - ej: prod/tablet-dark/proposals
123. **[friccion] ×1** — Rail izquierdo, primer elemento de la lista de proyectos: 'Proyecto: wt-paneles-ma... ○1': Nombre de proyecto truncado con puntos suspensivos y el contador '○1' pegado al final sin espacio, dando sensación de texto cortado y datos incompletos.
   - ej: prod/tablet-dark/proposals
124. **[friccion] ×1** — barra superior, extremo derecho (top-right): El contador de agentes 'N/M' aparece cortado/clipped contra el borde derecho y solapado por el icono de panel: la barra de acciones desborda horizontalmente en tablet y el último elemento queda ilegible.
   - ej: prod/tablet-dark/session
125. **[friccion] ×1** — fila de chips de filtro (Todos/Encargos/Decisiones/Fallos/Informes), parte superior del panel derecho: La fila de pestañas se desborda: el chip 'Informes 1…' queda cortado en el borde derecho sin affordance de scroll ni indicación de más opciones, en viewport 820px
   - ej: prod/tablet-dark/timeline
126. **[friccion] ×1** — sidebar, fila 'Proyecto: wt-paneles-sesiones': El texto llega al borde derecho del sidebar y queda cortado sin elipsis ni indicación de contenido oculto; se solapa con el límite del panel.
   - ej: prod/tablet-light/home
127. **[friccion] ×1** — composer, fila de controles bajo el input (iconos imagen/micrófono): Targets de los iconos de imagen y micrófono pequeños (~24-28px) y muy separados del resto de controles ('Failover Normal (Default)', 'auto', 'configured', 'Compact'), que quedan dispersos en toda la anchura.
   - ej: prod/tablet-light/home
128. **[friccion] ×1** — área central completa (viewport 820x1180): La vista cargada no corresponde a Post Studio (?view=post-studio): se muestra un documento markdown de sesión/agentes con lista de cambios de UI, no carruseles ni editor de posts de redes.
   - ej: prod/tablet-light/post-studio
129. **[friccion] ×1** — barra superior derecha (tabs: Tools, ...M): Desbordamiento horizontal del header: los últimos elementos quedan cortados en el borde derecho ('...M' a medias), indicando overflow de la tira de pestañas/herramientas.
   - ej: prod/tablet-light/post-studio
130. **[friccion] ×1** — sidebar izquierdo, lista de proyectos (Proyecto: wt-paneles-ma...): Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma...') sin tooltip ni expansión visible, y badge 'C 1' pegado al texto truncado.
   - ej: prod/tablet-light/post-studio
131. **[friccion] ×1** — Múltiples zonas: sidebar 'Línea de tiempo' y 'Agentes', pestañas 'Pendientes (12)' y 'Todas (104)', dropdown 'Por urgencia / caducidad', checkbox junto a 'Respuesta personalizada': Iconos/glifos que renderizan como cajas vacías (tofu): se pierde el significado del icono y da sensación de UI rota, especialmente en las pestañas de estado y en el checkbox (parece un control sin renderizar).
   - ej: prod/tablet-light/proposals
132. **[friccion] ×1** — barra superior derecha (Full history / Generate title / Branches / System / Tools): La barra de pestañas desborda por la derecha: el último elemento aparece cortado ('M') a mitad y el botón de menú queda pegado al borde de la ventana, sin margen.
   - ej: prod/tablet-light/session
133. **[friccion] ×1** — chips de archivos debajo del mensaje, justo encima del composer: La última fila de chips (SessionSidebar.test.mjs, route.ts) queda parcialmente tapada/cortada por el campo de mensaje; la flecha indicadora se solapa con el borde del composer y route.ts se ve cortado.
   - ej: prod/tablet-light/session
134. **[friccion] ×1** — Panel derecho, fila de filtros por tipo de evento (cerca del borde derecho): El chip 'Informes 1...' queda cortado en el borde del viewport: la fila de pestañas desborda horizontalmente sin scroll ni degradado visible que indique que hay más filtros ocultos.
   - ej: prod/tablet-light/timeline
135. **[friccion] ×1** — Panel derecho, tarjetas de eventos 'caduca: ...' (bloques de descripción en gris): Las descripciones largas se renderizan en gris muy claro sobre fondo gris claro, con contraste muy bajo y párrafos densos de 5-6 líneas que hacen la timeline ilegible de un vistazo.
   - ej: prod/tablet-light/timeline
136. **[friccion] ×1** — Sidebar, lista de proyectos y filas de eventos (iconos delante del texto): Los iconos se dibujan como glifos cuadrados huecos (tofu/sustituto) en 'Proyecto: wt-...', 'Rutina: reconcile', 'probe-cwd' y en cada fila de evento ('▯ Rutina:', '▯ ▯ caduca:'), sugiriendo iconos rotos o fallback de fuente.
   - ej: prod/tablet-light/timeline
137. **[cosmetica] ×1** — varias zonas (Cuota de Tokens, Renovación de ciclo, input Buscar, nombres de Proyecto, chips de filtro UI/FaceSearch/Comms/Rutinas/Planes, opción 'Mayor CPU'): Los iconos/emoji se renderizan como cajas vacías (glifo faltante/tofu), lo que ensucia la interfaz y da sensación de rotura.
   - ej: pre/desktop-dark/activity
138. **[cosmetica] ×1** — tarjeta Voz (canales principales, centro): A diferencia de ROT y FaceSearch, la tarjeta Voz no muestra fila 'Sesión activa: ... Abrir sesión →', dejando un hueco vacío y una inconsistencia de información entre tarjetas.
   - ej: pre/desktop-dark/activity
139. **[cosmetica] ×1** — panel principal, zona inferior (bajo 'Catálogo de skills (80)'): Gran área vacía (~400px) sin contenido ni mensaje; el 'Catálogo de skills (80)' aparece como cabecera colapsada sin pistas de que hay 80 items dentro, lo que hace parecer la vista incompleta.
   - ej: pre/desktop-dark/agents
140. **[cosmetica] ×1** — tarjetas de agentes (dev, exohuman-ui, rot), esquina superior derecha: El chevron de colapsar está muy alejado del título/badges, pegado al borde derecho de la tarjeta, lo que dificulta asociarlo con el agente y desperdicia ancho.
   - ej: pre/desktop-dark/agents
141. **[cosmetica] ×1** — Tarjetas — metadatos superiores derechos ('Llevan 8m enc-6d8067e1'): Duración e id concatenados sin separación clara en gris de bajo contraste sobre fondo oscuro; el id apenas se distingue y la info queda poco legible.
   - ej: pre/desktop-dark/encargos
142. **[cosmetica] ×1** — Sidebar izquierdo, bloque de navegación: item 'Línea de tiempo': El label 'Línea de tiempo' envuelve a dos líneas y hace que ese item sea más alto que el resto de la navegación ('Actividad', 'Paneles', 'Post Studio'...), rompiendo el ritmo vertical de la lista.
   - ej: pre/desktop-dark/home
143. **[cosmetica] ×1** — Sidebar izquierdo, item 'exohuman-ui' bajo el árbol de sesiones: Estado vacío 'No sessions yet' como único texto gris pequeño, sin icono ni acción para crear una primera sesión; además el texto está en inglés mientras el resto del UI está en español.
   - ej: pre/desktop-dark/home
144. **[cosmetica] ×1** — Centro, composer: placeholder del textarea 'Message... Type / for commands, @ for files': Placeholder en inglés ('Message... Type / for commands') en una interfaz que por el resto está traducida al español, inconsistencia de idioma.
   - ej: pre/desktop-dark/home
145. **[cosmetica] ×1** — Centro, fila de controles bajo el composer (iconos adjuntar/mic + 'Failover Normal (Default)', 'auto', 'configured', 'Compact'): Los iconos de adjuntar y micrófono son muy pequeños y de bajo contraste sobre fondo oscuro, y la fila mezcla iconos sueltos con etiquetas de texto seguidas de iconos, quedando la configuración del envío poco jerarquizada y apretada.
   - ej: pre/desktop-dark/home
146. **[cosmetica] ×1** — Sidebar izquierdo, cabecera 'FILES': fila de iconos de acciones (>, carpeta, upload, refresh, eye, .., búsqueda): Los iconos de acciones de la cabecera FILES son diminutos y están muy juntos, con targets poco diferenciados y sin separación clara entre acciones del árbol y de búsqueda.
   - ej: pre/desktop-dark/home
147. **[cosmetica] ×1** — Píldora del filtro 'Activos' (fila de filtros, zona superior del contenido): Hay un pequeño elemento/glifo suelto que se solapa con la etiqueta 'Activos' en la esquina superior derecha de la píldora, rompiendo el acabado del botón seleccionado.
   - ej: pre/desktop-dark/paneles
148. **[cosmetica] ×1** — Fila de filtros + buscador 'Buscar panel...' (parte superior del área principal): El input de búsqueda tiene mayor alto que las píldoras de filtro y sus bordes superior/inferior no alinean con los de los botones, dejando la fila desalineada verticalmente.
   - ej: pre/desktop-dark/paneles
149. **[cosmetica] ×1** — Cabecera de sección 'COMPARATIVAS 2' (entre GALERÍAS y las tarjetas naranjas): El icono decorativo previo al rótulo se solapa ligeramente con la letra inicial de 'COMPARATIVAS', y el icono de 'GALERÍAS' presenta el mismo ajuste justo.
   - ej: pre/desktop-dark/paneles
150. **[cosmetica] ×1** — columna derecha, fila de música B (Indie emotivo), línea inferior del reproductor: El texto de estado 'en pausa · 0:00 / 0:00 · loop' tiene contraste muy bajo respecto al fondo del card seleccionado, apenas legible; la barra de progreso es una línea casi imperceptible.
   - ej: pre/desktop-dark/post-studio
151. **[cosmetica] ×1** — columna derecha, lista 'TUS FOTOS', fila 6 (Velas) en el borde inferior: La fila 6 queda cortada/parcialmente oculta bajo la barra fija de confirmación del footer, sin margen de respiro visible entre el final de la lista y la barra.
   - ej: pre/desktop-dark/post-studio
152. **[cosmetica] ×1** — mockup central, cabecera de la historia (rgsaura · La Herradura): El texto de usuario/título de la historia queda pegado al borde derecho del frame del mockup, con riesgo de truncado en nombres más largos.
   - ej: pre/desktop-dark/post-studio
153. **[cosmetica] ×1** — opciones propuestas C, D, E (centro de la captura): Las tarjetas C 'Donzapas', D 'BananaSurf', E 'Savage' sólo muestran un nombre propio sin verbo ni descripción, en contraste con A y B que sí enuncian la acción; jerarquía y contenido inconsistente que dificulta decidir.
   - ej: pre/desktop-dark/proposals
154. **[cosmetica] ×1** — esquina superior derecha de la barra de filtros: Pequeño control (checkbox con desplegable) pegado al borde derecho del viewport, de tamaño reducido y sin margen ni etiqueta visible, fácil de pasar por alto.
   - ej: pre/desktop-dark/proposals
155. **[cosmetica] ×1** — borde derecho, junto al área del input (icono de candado): Botón/icono de candado flotante pegado al borde derecho, casi recortado contra el margen de la ventana; parece un control suelto sin contenedor ni margen visible.
   - ej: pre/desktop-dark/session-scrolled
156. **[cosmetica] ×1** — barra superior derecha (contadores 243k / 85k / 26.5M / 18% / 1.0M): Cinco métricas apiladas sin etiquetas legibles ni separación clara; difícil saber qué representa cada valor de un vistazo (jerarquía confusa).
   - ej: pre/desktop-dark/session-scrolled
157. **[cosmetica] ×1** — barra de pie inferior derecha (off / configured / Compact): Etiquetas de estado en gris muy pequeño y bajo contraste sobre fondo oscuro; apenas legibles y sin relación clara con los iconos que las preceden.
   - ej: pre/desktop-dark/session-scrolled
158. **[cosmetica] ×1** — placeholder del input de mensaje y botón Send (abajo centro): Mezcla de idiomas: UI en español pero placeholder en inglés ("Message... Type / for commands, @ for files") y botón "Send" en inglés.
   - ej: pre/desktop-dark/session
159. **[cosmetica] ×1** — sidebar izquierdo, subetiquetas de navegación (pasado → próximo, entregables, prompts · skills): Texto secundario en gris muy tenue sobre fondo oscuro, contraste bajo que dificulta la lectura.
   - ej: pre/desktop-dark/session
160. **[cosmetica] ×1** — barra de herramientas inferior del chat (Failover Fast, off, configured, Compact): Controles y estados mezclados sin etiquetas claras ni separación visual consistente, con iconos pequeños apilados en la esquina inferior derecha.
   - ej: pre/desktop-dark/session
161. **[cosmetica] ×1** — cabecera del panel — junto al botón 'Añadir' (esquina superior derecha): Botón '×' de cierre pequeño, iconográfico y sin etiqueta, pegado al botón primario 'Añadir'; target reducido y riesgo de confusión/accidentalidad por proximidad al CTA principal.
   - ej: pre/desktop-dark/timeline
162. **[cosmetica] ×1** — pestañas Eventos/Patrones por hora — borde derecho de la pestaña 'Patrones por hora': Queda un pequeño elemento/fragmento suelto justo tras la pestaña 'Patrones por hora' que parece un resto de control o badge cortado, rompiendo la limpieza de la fila de pestañas.
   - ej: pre/desktop-dark/timeline
163. **[cosmetica] ×1** — sidebar — fila 'Línea de tiempo' con subtítulo 'pasado → próximo': El texto del subtítulo queda muy apretado contra el borde derecho del item y compite con el nombre de dos líneas del item, dejando la fila con aspecto congestionado y sin espacio de respiración.
   - ej: pre/desktop-dark/timeline
164. **[cosmetica] ×1** — composer central, placeholder del input y barra inferior: Mezcla de idiomas: placeholder 'Message... Type / for commands, @ for files' y controles 'auto'/'configured' en inglés mientras el resto de la interfaz está en español
   - ej: pre/desktop-light/home
165. **[cosmetica] ×1** — top bar, botones 'Full history' y 'Generate title': Texto en gris muy claro con contraste insuficiente sobre fondo claro; parecen deshabilitados aunque probablemente sean activos, lo que rompe la jerarquía frente a 'System'/'Tools' que sí son legibles
   - ej: pre/desktop-light/home
166. **[cosmetica] ×1** — previsualización del carrusel (parte izquierda del área principal), cabecera oscura sobre la foto: El texto «rgsaura · La Herradura •» queda truncado/cortado contra el borde derecho de la tarjeta sin elipsis visible, el «•» final aparece a medias.
   - ej: pre/desktop-light/post-studio
167. **[cosmetica] ×1** — sección 3 · Tus fotos, parte inferior de la lista (centro-derecha): La fila 6 «Velas» queda cortada a la mitad bajo la barra inferior fija (footer), sin padding de cierre del scroll ni separación que indique que la lista continúa.
   - ej: pre/desktop-light/post-studio
168. **[cosmetica] ×1** — barra superior derecha, botón de icono junto al desplegable 'Por urgencia / caducidad': El botón de icono queda muy pegado al borde derecho del viewport (margen menor que el resto de la interfaz), lo que rompe la retícula del header.
   - ej: pre/desktop-light/proposals
169. **[cosmetica] ×1** — área principal, tarjeta de opción B: La opción B contiene sólo 'limpieza' (una palabra, en minúsculas) mientras el resto lleva descripciones completas; la altura de las tarjetas y la información quedan descompensadas y la jerarquía de decisión es confusa.
   - ej: pre/desktop-light/proposals
170. **[cosmetica] ×1** — Sidebar izquierdo, metadatos de cada entrada ("pasado→próximo", "entregables", "pre", "prompts·skills"): Texto secundario en gris muy claro sobre fondo blanco, tamaño pequeño: contraste bajo y difícilmente legible en las etiquetas de estado de las entradas de navegación.
   - ej: pre/desktop-light/session
171. **[cosmetica] ×1** — Barra superior derecha, contadores de recursos (↑243k ↓85k 26.5M 18%/1.0M): Contadores amontonados contra el borde derecho sin separación ni etiquetas de tooltip visibles; el contador de descarga muestra un carácter de relleno/superíndice pegado al valor ("85k") que rompe la alineación visual.
   - ej: pre/desktop-light/session
172. **[cosmetica] ×1** — Barra de estado inferior derecha ("off" / "configured" / "Compact"): Etiquetas sueltas sin icono ni texto descriptor claro (p.ej. "configured" no indica qué está configurado), jerarquía confusa en comparación con "Failover Fast" que sí tiene icono.
   - ej: pre/desktop-light/session
173. **[cosmetica] ×1** — sidebar izquierdo, barra de herramientas de la sección FILES: Fila de iconos (terminal, carpeta, upload, etc.) muy pequeños y sin etiquetas, amontonados sobre un input vacío, con targets difíciles de distinguir y de clicar.
   - ej: pre/desktop-light/timeline
174. **[cosmetica] ×1** — chips de filtro (Todos 0, Encargos 0, ... Retro 0): Todos los chips muestran contador 0, por lo que la fila de 10 filtros aporta ruido sin utilidad cuando no hay datos que filtrar.
   - ej: pre/desktop-light/timeline
175. **[cosmetica] ×1** — Título de la vista 'Encargos y Objetivos' (superior izquierda): El título se parte en tres líneas ('Encargos'/'y'/'Objetivos') por el badge contiguo, ocupando mucho espacio vertical en móvil.
   - ej: pre/mobile-dark/encargos
176. **[cosmetica] ×1** — Filtro de estado activo 'En curso / Activos': El texto del filtro se envuelve en dos líneas dentro del botón, rompiendo la alineación con 'Todos' y 'Completados' que van en una línea.
   - ej: pre/mobile-dark/encargos
177. **[cosmetica] ×1** — composer: placeholder del input: Placeholder largo ('Message... Type / for commands, @') en fuente grande que ocupa casi todo el ancho disponible del input, compitiendo con el botón de envío y dando sensación de desborde.
   - ej: pre/mobile-dark/home
178. **[cosmetica] ×1** — Cabecera de sección 'INFORMES 4' (izquierda) y botón 'Sesiones ▼' de cada tarjeta: El icono se renderiza como un cuadro vacío (glyph roto/emoji o fuente de iconos ausente) tanto en el encabezado de la sección como en el botón de cada tarjeta, aspecto de placeholder.
   - ej: pre/mobile-dark/paneles
179. **[cosmetica] ×1** — Botones 'Actualizar' y 'Cerrar' bajo el título (arriba-izquierda): 'Cerrar' es ambiguo y comparte el mismo peso visual que 'Actualizar'; en móvil no queda claro qué acción cierra (panel, vista o sesión).
   - ej: pre/mobile-dark/paneles
180. **[cosmetica] ×1** — overlay inferior de la tarjeta de previsualización (indicador de paginación): La fila de puntos del carrusel es muy pequeña y el "+7" aparece pegado a los puntos sin separación clara, con targets táctiles mínimos en móvil
   - ej: pre/mobile-dark/post-studio
181. **[cosmetica] ×1** — cabecera de la tarjeta de previsualización (sobre la foto): El texto "rsgaura · La Herradura" se apoya sobre una zona clara de la imagen con degradado poco marcado, contraste justo para lectura
   - ej: pre/mobile-dark/post-studio
182. **[cosmetica] ×1** — fila 'Origen:', enlace 'Ver sesión en vivo' (derecha): El icono de enlace externo queda pegado al borde del chip de origen y el texto del enlace se parte en dos líneas justo al lado, quedando apretado contra el chip.
   - ej: pre/mobile-dark/proposals
183. **[cosmetica] ×1** — borde superior del área de contenido bajo la barra fija: El texto del mensaje queda cortado a media línea bajo la barra superior sin separación visual (fade/padding), da sensación de contenido roto al hacer scroll.
   - ej: pre/mobile-dark/session
184. **[cosmetica] ×1** — barra inferior, fila de iconos (imagen, micrófono, chip) y 'Failover Fast': Controles de la barra inferior desiguales en estilo y peso visual: iconos sueltos a la izquierda frente a botones de texto ('Failover Fast', 'More controls'), jerarquía confusa y anchos de target variables en móvil.
   - ej: pre/mobile-dark/session
185. **[cosmetica] ×1** — tarjeta 'Línea de tiempo', parte superior del sidebar: El título salta a dos líneas mientras 'pasado → próximo' también se parte en dos, generando una fila desalineada respecto al resto de tarjetas de una sola línea
   - ej: pre/mobile-dark/sidebar-open
186. **[cosmetica] ×1** — barra superior derecha, junto al icono de panel: Métricas '85k 18%' sin etiqueta ni unidad, difíciles de interpretar y compitiendo con los iconos de acción
   - ej: pre/mobile-dark/sidebar-open
187. **[cosmetica] ×1** — franja derecha tras el drawer: El texto del contenido subyacente queda cortado a media palabra sin scrim de fondo claro, lo que hace que la parte visible se lea como contenido roto
   - ej: pre/mobile-dark/sidebar-open
188. **[cosmetica] ×1** — iconos de cada fila de evento y de los chips de filtro (columna izquierda): Los iconos se renderizan como rectángulos/cajas idénticos y sin semántica aparente (posibles glifos rotos o placeholder), lo que no ayuda a distinguir rutina / encargo / decisión de un vistazo.
   - ej: pre/mobile-dark/timeline
189. **[cosmetica] ×1** — cabecera superior derecha, 'Session info' e icono de panel: El texto 'Session info' está en inglés en una interfaz totalmente en español y su target junto al icono de panel es estrecho, con ambos elementos muy pegados al borde superior.
   - ej: pre/mobile-dark/timeline
190. **[cosmetica] ×1** — subtítulo bajo el logo, 'v1.0.0 · pi v1.2.0': Versión en gris muy tenue con contraste insuficiente sobre fondo claro.
   - ej: pre/mobile-light/home
191. **[cosmetica] ×1** — fila de controles del composer, iconos de imagen y micrófono: Iconos pequeños y muy juntos entre sí y respecto a los textos adyacentes; en móvil el área táctil efectiva parece <44px, incómodo de pulsar.
   - ej: pre/mobile-light/home
192. **[cosmetica] ×1** — cabecera (icono junto al título) y pestañas 'Carrusel' y 'Reel': Los iconos se renderizan como cuadrados vacíos (tofu/glyph faltante), sugiriendo emoji o fuente de iconos no cargada.
   - ej: pre/mobile-light/post-studio
193. **[cosmetica] ×1** — tarjeta de previsualización, paginación inferior de fotos: Se muestran 12 puntos + '+7' junto al contador '1/19'; el '+7' es ambiguo respecto a cuántas fotos hay realmente y su relación con los puntos.
   - ej: pre/mobile-light/post-studio
194. **[cosmetica] ×1** — bloque Origen — chip junto a título: El chip de origen con texto monoespaciado ('Sesión proactiva · conexiones · 17-10') se parte en dos líneas dentro de su caja con borde, resultando apretado y con aspecto roto.
   - ej: pre/mobile-light/proposals
195. **[cosmetica] ×1** — enlace 'Ver sesión en vivo' — derecha del chip Origen: El enlace se parte en dos líneas ('Ver sesión / en vivo') apretado contra el chip de origen, con poco espacio y jerarquía visual confusa en móvil.
   - ej: pre/mobile-light/proposals
196. **[cosmetica] ×1** — cabecera superior — 'Session info' y icono de panel: Texto 'Session info' en color gris muy claro sobre fondo claro, contraste bajo y difícil de leer en móvil.
   - ej: pre/mobile-light/proposals
197. **[cosmetica] ×1** — Cuerpo del mensaje, línea con el chip '( console/proposals/activity/mobile-check )': El chip de código inline se solapa visualmente con los paréntesis que lo envuelven: el '(' queda tapado por el borde izquierdo del chip y el ')' pegado/superpuesto al borde derecho.
   - ej: pre/mobile-light/session
198. **[cosmetica] ×1** — Barra inferior derecha, botón 'More controls': El texto llega muy pegado al borde derecho del viewport, sin margen de seguridad, y junto a 'Failover Fast' se lee en gris claro con bajo contraste sobre fondo blanco.
   - ej: pre/mobile-light/session
199. **[cosmetica] ×1** — Pie inferior, fila '⚡ Default': La fila de estado queda casi pegada al borde inferior de la pantalla con padding mínimo y tono gris muy claro, apenas legible.
   - ej: pre/mobile-light/session
200. **[cosmetica] ×1** — Item 'Línea de tiempo' del sidebar: El rótulo rompe en dos líneas ('Línea de / tiempo') mientras el resto de items son de una línea, rompiendo el ritmo vertical y acercando el icono al texto.
   - ej: pre/mobile-light/sidebar-open
201. **[cosmetica] ×1** — Chevrons de expandir del árbol de proyectos (izquierda): Los iconos '>' son muy pequeños y con poco contraste gris, difíciles de tocar y de percibir como control de expansión.
   - ej: pre/mobile-light/sidebar-open
202. **[cosmetica] ×1** — Barra superior, botones 'Full history' y 'Generate title': Texto e iconos con contraste muy bajo sobre el fondo oscuro (parecen deshabilitados sin feedback claro), difíciles de leer.
   - ej: pre/tablet-dark/home
203. **[cosmetica] ×1** — Sidebar izquierdo, fila 'Línea de tiempo': El label 'Línea de tiempo' salta a dos líneas y 'pasado→ próximo' también, la fila queda desalineada respecto a las demás del nav.
   - ej: pre/tablet-dark/home
204. **[cosmetica] ×1** — Sidebar izquierdo, toolbar de FILES (fila de iconos >_ folder subir refresh ojo etc.): Seis iconos amontonados sin separación ni etiquetas, con targets táctiles pequeños para tablet; difícil distinguir su función.
   - ej: pre/tablet-dark/home
205. **[cosmetica] ×1** — Panel principal, fila de controles bajo el composer ('Failover Normal (Default)' 'auto' 'configured' 'Compact'): Controles dispersos en una sola línea con etiquetas ambiguas ('auto', 'configured') sin agrupación ni jerarquía, y 'Compact' pegado al borde derecho de la zona útil.
   - ej: pre/tablet-dark/home
206. **[cosmetica] ×1** — Barra lateral izquierda, sección FILES: El árbol de archivos ocupa toda la altura del sidebar empujando el resto del contenido y compitiendo con la vista principal; en tablet 820px el espacio central se estrecha considerablemente.
   - ej: pre/tablet-dark/post-studio
207. **[cosmetica] ×1** — Cabecera Post Studio, botón 'Cerrar' junto a badge 'PRE · nada se publica': Los controles de cabecera están apretados y desbalanceados respecto al título, con poco aire entre badge y botón.
   - ej: pre/tablet-dark/post-studio
208. **[cosmetica] ×1** — Sidebar izquierdo + cabecera principal (iconos de 'Línea de tiempo', 'Paneles', 'Post Studio', 'Agentes', pestañas 'Pendientes'/'Todas', checkbox de 'Respuesta personalizada'): Los iconos se renderizan como rectángulos vacíos (glifos tofu), señal de fuente/icon set roto en el build PRE; se repite en toda la UI
   - ej: pre/tablet-dark/proposals
209. **[cosmetica] ×1** — Fila inferior de paginación, botón '← Anterior': El botón 'Anterior' aparece deshabilitado con texto de bajo contraste sobre fondo casi idéntico, apenas legible
   - ej: pre/tablet-dark/proposals
210. **[cosmetica] ×1** — barra superior, extremo derecho (junto al toggle de panel): El indicador 'N/M' del agente queda truncado/cortado por el borde derecho del viewport, mostrando solo una parte de la etiqueta
   - ej: pre/tablet-dark/session
211. **[cosmetica] ×1** — barra superior derecha, icono flotante suelto: Aparece un icono de candado desplazado a la derecha sobre el área de chat, separado del resto de controles y sin alineación clara con la barra de herramientas
   - ej: pre/tablet-dark/session
212. **[cosmetica] ×1** — sidebar izquierdo, entrada 'Línea de tiempo': El label 'Línea de tiempo' envuelve a dos líneas mientras la meta 'pasado → próximo' también ocupa dos, haciendo la fila más alta y desalineada respecto al resto de entradas del menú
   - ej: pre/tablet-dark/session
213. **[cosmetica] ×1** — sidebar, ítem de navegación con badge 4 (entre Workspaces y Decisions): Inconsistencia de naming: en el sidebar aparece 'Encargas' mientras en los chips del filtro aparece 'Encargos 0'; tipografía/etiqueta incorrecta.
   - ej: pre/tablet-dark/timeline
214. **[cosmetica] ×1** — sidebar, fila 'Línea de tiempo': El subtítulo 'pasado → próximo' se parte en dos líneas y queda apretado contra el título 'Línea de tiempo', rompiendo la alineación horizontal del resto de filas de navegación.
   - ej: pre/tablet-light/home
215. **[cosmetica] ×1** — topbar superior, items 'Full history' y 'Generate title': Texto en gris muy claro con contraste insuficiente respecto al fondo, leyéndose como deshabilitado/ilegible en tema claro.
   - ej: pre/tablet-light/home
216. **[cosmetica] ×1** — barra de controles bajo el composer (derecha): Los controles (imagen, micrófono, 'Failover Normal (Default)', 'auto', 'configured', 'Compact') están muy separados entre sí y 'Compact' queda pegado al borde derecho del área, con iconos sueltos sin etiqueta que aprietan la lectura en tablet.
   - ej: pre/tablet-light/home
217. **[cosmetica] ×1** — centro, preview del carrusel, flechas laterales < >: Los botones de navegación del carrusel son círculos pequeños sobre la foto, con bajo contraste respecto a la imagen, difícil de localizar y target táctil justo en tablet.
   - ej: pre/tablet-light/post-studio
218. **[cosmetica] ×1** — barra inferior, botón "Confirmar decisión → OpenPost": El botón de acción primaria queda muy pegado al borde derecho de la pantalla, sin margen lateral visible, y su texto es largo para el ancho disponible.
   - ej: pre/tablet-light/post-studio
219. **[cosmetica] ×1** — columna derecha, titular "2 · MÚSICA — PULSA PARA ESCUCHAR": El titular en mayúsculas se parte en tres líneas por el ancho estrecho de la columna, rompiendo la jerarquía visual respecto al resto de secciones.
   - ej: pre/tablet-light/post-studio
220. **[cosmetica] ×1** — Bloque Origen · enlace 'Ver sesión en vivo' (junto a la tarjeta Origen): El enlace se rompe en tres líneas apiladas ('Ver / sesión / en vivo') por estar en una columna demasiado estrecha; aspecto desordenado frente al botón contiguo.
   - ej: pre/tablet-light/proposals
221. **[cosmetica] ×1** — Fila de filtros superior derecha · botón junto al select 'Por urgencia / caducidad': El botón muestra glifos ilegibles ('→·') en lugar de un icono reconocible, probablemente glyph faltante o tooltip mal pintado.
   - ej: pre/tablet-light/proposals
222. **[cosmetica] ×1** — Varios iconos en toda la interfaz (botón 'Añadir' del header, pestañas 'Eventos'/'Patrones por hora', chips 'Encargos/Decisiones/Informes', títulos 'Proyecto: ...' del sidebar y marcadores 'caduca' de los eventos): Los iconos se renderizan como cuadrados vacíos (tofu/glifo faltante), indicando una fuente de iconos que no carga o caracteres no soportados; afecta a gran parte de la UI y rompe la legibilidad de acciones.
   - ej: pre/tablet-light/timeline
223. **[cosmetica] ×1** — Sidebar izquierdo, sección 'Línea de tiempo' y 'Paneles': El subtítulo 'pasado → próximo' envuelve en dos líneas y queda casi pegado al borde de la tarjeta, con la flecha suelta en la segunda línea; jerarquía algo desordenada.
   - ej: pre/tablet-light/timeline
224. **[cosmetica] ×1** — sidebar izquierdo, lista de proyectos; tarjeta 'FaceSearch'; filas 'Sesión activa' de canales ROT y FaceSearch: Textos truncados visibles: 'Proyecto: wt-paneles-ma...', 'rg-facesearch-sentinel....', 'rot-tel...' y 'facesear...' cortados sin tooltip/expandir.
   - ej: prod/desktop-dark/activity
225. **[cosmetica] ×1** — sidebar izquierdo, lista de proyectos, fila 'probe-cwd': La fila 'probe-cwd' no lleva icono inicial mientras el resto de filas sí, rompiendo la alineación vertical de los iconos.
   - ej: prod/desktop-dark/activity
226. **[cosmetica] ×1** — barra superior derecha, junto a 'EN VIVO': Botón/icono de estado (~24x24) muy pequeño y pegado al borde derecho, con target mínimo apenas visible junto al indicador EN VIVO.
   - ej: prod/desktop-dark/activity
227. **[cosmetica] ×1** — tarjetas de agente (dev / exohuman-ui / rot), esquina derecha: El chevron de plegar/desplegar es un control muy pequeño y aislado en el borde derecho, difícil de localizar y con área de clic reducida.
   - ej: prod/desktop-dark/agents
228. **[cosmetica] ×1** — barra lateral, fila 'probe-cwd' en la lista de proyectos: 'probe-cwd' no lleva icono mientras el resto de filas de proyecto sí, rompiendo la consistencia visual de la lista.
   - ej: prod/desktop-dark/agents
229. **[cosmetica] ×1** — barra lateral, contadores de 'Proyecto: wt-paneles-ma...' y 'Proyecto: wt-poststudio-v2' (dígito '0'): Los contadores '0' tienen muy bajo contraste sobre el fondo oscuro y casi no se distinguen del fondo.
   - ej: prod/desktop-dark/agents
230. **[cosmetica] ×1** — Sidebar izquierdo, lista de proyectos (parte media-inferior): El nombre 'Proyecto: wt-paneles-ma...' está truncado con puntos suspensivos y convive con un badge numérico '1' justo al lado, dificultando identificar el proyecto completo.
   - ej: prod/desktop-dark/encargos
231. **[cosmetica] ×1** — Tarjetas de encargos, esquina superior derecha (metadatos): La línea de metadatos ('Llevan 2m enc-6d8067e1') es gris muy tenue sobre fondo oscuro y amontona duración e ID sin separador claro, apenas legible a este tamaño.
   - ej: prod/desktop-dark/encargos
232. **[cosmetica] ×1** — Composer > barra de controles inferior del input (fila derecha): Controles 'auto', 'configured', 'Compact' y el icono de volumen están apilados muy juntos con iconos pequeños y texto mínimo, sin separación clara entre grupos semánticos (modo / estado / vista / audio).
   - ej: prod/desktop-dark/home
233. **[cosmetica] ×1** — Sidebar > barra de herramientas de FILES (fila de iconos junto a 'FILES · 25'): Seis iconos de acción (cerrar, colapsar, subir, refrescar, ojo, buscar) de ~12px muy comprimidos y con poca separación, targets difíciles de pulsar incluso en desktop.
   - ej: prod/desktop-dark/home
234. **[cosmetica] ×1** — Barra superior > extremo derecho (parte superior de la captura): El icono de panel queda pegado al borde derecho del viewport sin margen de aire respecto al resto de la topbar.
   - ej: prod/desktop-dark/home
235. **[cosmetica] ×1** — barra superior derecha, métricas: Agrupación de métricas '243k ↑ 85k ↓ 26.5M ⊙ 18% / 1.0M' muy comprimida y sin etiquetas claras de qué representan cada valor.
   - ej: prod/desktop-dark/paneles
236. **[cosmetica] ×1** — sidebar, lista de proyectos: Entrada 'probe-cwd' sin icono de proyecto ni contexto, mezclada con los 'Proyecto: wt-...' rompiendo la consistencia visual de la lista.
   - ej: prod/desktop-dark/paneles
237. **[cosmetica] ×1** — Barra superior derecha (System/Tools): La etiqueta 'Tools' queda parcialmente recortada por el botón toggle de panel del borde derecho; el control se amontona contra el borde.
   - ej: prod/desktop-dark/post-studio
238. **[cosmetica] ×1** — header superior izquierdo, tab del logo 'Exohuman UI': El texto del logo aparece recortado por arriba y se solapa con el botón de cierre (x) del tab; la pestaña parece cortada en el borde superior del viewport.
   - ej: prod/desktop-dark/proposals
239. **[cosmetica] ×1** — fila 'Origen' de la tarjeta, chip 'Brief matutino · 20-10': El texto del chip se ve comprimido/truncado dentro del recuadro gris y con bajo contraste respecto al resto de la fila 'Origen'.
   - ej: prod/desktop-dark/proposals
240. **[cosmetica] ×1** — barra de filtros superior derecha, botón icono junto al desplegable 'Por urgencia / caducidad': El último botón de la barra queda casi pegado al borde derecho de la ventana, sin margen lateral, y su icono es poco identificable.
   - ej: prod/desktop-dark/proposals
241. **[cosmetica] ×1** — Sidebar izquierdo, lista de proyectos: Los nombres se truncan con puntos suspensivos ('Proyecto: wt-paneles-ma...') y los contadores '0' y '1' quedan sueltos al final sin explicación visual clara.
   - ej: prod/desktop-dark/session-scrolled
242. **[cosmetica] ×1** — Sidebar izquierdo, cabecera del panel FILES: El rótulo aparece cortado ('FILE...') y la fila de iconos de acciones (explorar, carpeta, upload, download, ojo, +, search) va muy apretada contra él, sin separación ni tooltips visibles.
   - ej: prod/desktop-dark/session-scrolled
243. **[cosmetica] ×1** — Footer inferior, fila de controles junto a 'Failover Fast': Controles 'off', 'configured', 'Compact' e iconos (imagen, micrófono, volumen) amontonados sin separación ni jerarquía, con targets pequeños y poco etiquetados.
   - ej: prod/desktop-dark/session-scrolled
244. **[cosmetica] ×1** — Sidebar izquierdo, lista de proyectos (mitad superior): Los nombres de proyecto quedan truncados con puntos suspensivos ('Proyecto: wt-paneles-ma…', 'Proyecto: wt-poststudio-v2'), impidiendo identificar el proyecto sin hover
   - ej: prod/desktop-dark/session
245. **[cosmetica] ×1** — Borde derecho, altura ~860px (icono de candado/panel): El icono de toggle del panel derecho aparece pegado y parcialmente cortado contra el borde de la ventana, casi ilegible como control
   - ej: prod/desktop-dark/session
246. **[cosmetica] ×1** — Área de mensaje del agente, parte superior del contenido: El mensaje del agente arranca a media frase ('proceso pi-web.js reiniciado):') sin cabecera ni contexto visible del inicio del bloque, dando sensación de contenido cortado al cargar la vista
   - ej: prod/desktop-dark/session
247. **[cosmetica] ×1** — Sidebar izquierdo, sección proyectos (Mitad izquierda): Los nombres de proyecto se truncan con puntos suspensivos ('Proyecto: wt-paneles-ma…') mientras otros caben completos, rompiendo la escaneabilidad de la lista.
   - ej: prod/desktop-dark/timeline
248. **[cosmetica] ×1** — Sidebar izquierdo, líneas de proyecto ('Proyecto: wt-paneles-ma…' y 'Proyecto: wt-poststudio-v2'): Los dos badges numéricos (0 y 1) con iconos van pegados al texto y entre sí, apelotonados al final de la línea y muy cerca del borde derecho del sidebar.
   - ej: prod/desktop-dark/timeline
249. **[cosmetica] ×1** — Panel central, eventos de timeline (descripciones de los 'caduca:'): Las descripciones de los eventos ocupan 2-3 líneas de texto gris apretado en cada fila, generando filas muy altas y densas frente a las rutinas de una sola línea, con jerarquía poco clara entre título y detalle.
   - ej: prod/desktop-dark/timeline
250. **[cosmetica] ×1** — Panel central, metadatos de eventos ('01:30 · programada', '09:00 · ocio · pendiente' etc.): Texto secundario en gris muy oscuro sobre fondo oscuro con contraste bajo, difícil de leer sobre todo en las líneas de estado/hora.
   - ej: prod/desktop-dark/timeline
251. **[cosmetica] ×1** — Barra superior (Full history, Generate title, System, Tools) y toolbar FILES: Controles agrupados muy juntos con iconos pequeños y sin separación clara entre acciones de barra superior; los iconos del toolbar FILES son blancos muy pequeños, difícil de distinguir su función.
   - ej: prod/desktop-dark/timeline
252. **[cosmetica] ×1** — sidebar, listado de sesiones: Nombres de sesión truncados con puntos suspensivos ('Proyecto: wt-paneles-ma…'), el título completo no es legible ni hay tooltip visible.
   - ej: prod/desktop-light/home
253. **[cosmetica] ×1** — explorador FILES, fila de iconos de acción: 7 iconos de acción (folder, upload, refresh, link, eye, history, search) muy apretados en ~200px, con targets pequeños y sin separación clara.
   - ej: prod/desktop-light/home
254. **[cosmetica] ×1** — barra superior derecha, 'Full history' y 'Generate title': Controles en gris muy claro con contraste apenas legible respecto al fondo, parecen deshabilitados sin estado alternativo explicativo.
   - ej: prod/desktop-light/home
255. **[cosmetica] ×1** — área principal, columna inferior del composer (texto 'Failover Normal (Default)' y controles de la derecha): Controles del pie del composer (auto, configured, Compact, volumen) muy dispersos y en gris de bajo contraste, jerarquía confusa frente al input principal.
   - ej: prod/desktop-light/home
256. **[cosmetica] ×1** — panel central, chips de archivos bajo la respuesta: Chips de nombres de archivo (p.ej. session-activity.test.mjs) muy estrechos respecto a su contenido, con el texto recortado/al límite del pill.
   - ej: prod/desktop-light/post-studio
257. **[cosmetica] ×1** — cabecera FILES del sidebar: Fila de 6 iconos de acción (nuevo, carpeta, subir, ver, copiar, buscar) muy apretados, objetivos táctiles pequeños y sin espacio entre ellos.
   - ej: prod/desktop-light/post-studio
258. **[cosmetica] ×1** — parte superior del panel central: El texto continúa cortado por el borde superior de la zona de scroll ('...proceso pi-web.js reiniciado):'), indicando corte de contenido no resaltado.
   - ej: prod/desktop-light/post-studio
259. **[cosmetica] ×1** — sidebar izquierdo, ítem 'Proyecto: wt-paneles-ma...': Nombre del proyecto truncado con puntos suspensivos, no se distingue de 'wt-poststudio-v2' al lado; útil tener título completo o tooltip.
   - ej: prod/desktop-light/proposals
260. **[cosmetica] ×1** — barra superior derecha, botón a la derecha del desplegable 'Por urgencia / caducidad': El botón está cortado por el borde derecho del viewport: solo se ve una fracción del contenido ('V...'), da sensación de desbordamiento horizontal de la barra de filtros.
   - ej: prod/desktop-light/proposals
261. **[cosmetica] ×1** — Sidebar izquierdo, fila "Hablar por Voz" / botón "ROT Live": El botón verde saturado "ROT Live" compite visualmente con el badge "en vivo" de Actividad y con los badges de contadores, aportando ruido cromático a la jerarquía del sidebar.
   - ej: prod/desktop-light/session
262. **[cosmetica] ×1** — Sidebar izquierdo, entradas de proyecto (ej. 'Proyecto: wt-paneles-ma...', 'Proyecto: wt-poststudio-v2', 'Proyecto: wt-explorer'): El nombre del proyecto se trunca con puntos suspensivos y no se ve completo; el contador '0 1' queda pegado al texto truncado sin separación clara.
   - ej: prod/desktop-light/timeline
263. **[cosmetica] ×1** — Lista de eventos, delante del texto 'caduca:' (4 eventos: Coworking & Founder Meetup, Cruz Novillo, Watcher Spotify, Cineteca Matadero): Aparece un glifo '⨯' suelto delante de 'caduca:' que parece un emoji/icono no renderizado o carácter roto; inconsistente con el resto de iconos de la lista.
   - ej: prod/desktop-light/timeline
264. **[cosmetica] ×1** — Cabeceras de grupo de fecha (Mié 21 Oct / Jue 22 Oct / Vie 23 Oct), número de eventos a la derecha (5, 3, 1): El contador del grupo está pegado al borde derecho de la ventana, casi sin margen, mientras los eventos tienen padding lateral visible; la alineación rota la retícula del panel.
   - ej: prod/desktop-light/timeline
265. **[cosmetica] ×1** — Sidebar izquierdo, sección FILES (barra de iconos . ↻ ⬆ ⬇ ◎ ⌄ + y campo de búsqueda): Los iconos de acción del árbol de archivos son muy pequeños y están muy apretados entre sí, con un campo de búsqueda mínimo debajo; targets difíciles de pulsar con precisión.
   - ej: prod/desktop-light/timeline
266. **[cosmetica] ×1** — título 'Encargos y Objetivos' + fila superior: El título ocupa tres líneas y empuja la fila de controles ('5 activos', '197 total', 'Actualizar', 'Cerrar') hacia la derecha, provocando el amontonamiento y el corte del último botón.
   - ej: prod/mobile-dark/encargos
267. **[cosmetica] ×1** — tarjetas de la lista (esquina inferior de las tarjetas 1 y 3): Solo la tarjeta central muestra el botón 'Ir a sesión de trabajo'; las demás no tienen acción visible, lo que rompe la consistencia de las tarjetas.
   - ej: prod/mobile-dark/encargos
268. **[cosmetica] ×1** — Zona superior-centro de la pantalla (todo el hueco por encima del título): Más del 35% de la pantalla está en blanco sin contenido ni estado (sin lista de sesiones visible ni indicación de estado), dejando el layout desequilibrado con todo el contenido agrupado en el centro.
   - ej: prod/mobile-dark/home
269. **[cosmetica] ×1** — Barra superior: texto 'Session info' y placeholder del input: Contraste muy bajo del gris sobre el fondo oscuro ('Session info' y el placeholder apenas se distinguen del fondo).
   - ej: prod/mobile-dark/home
270. **[cosmetica] ×1** — campo de mensaje inferior (placeholder): El placeholder 'Message... Type / for commands, @' termina en '@' sin cerrar, aparentemente truncado dentro del ancho disponible.
   - ej: prod/mobile-dark/paneles
271. **[cosmetica] ×1** — parte superior del contenido del mensaje: La primera línea de texto queda cortada a media altura pegada al borde superior (bajo la barra de estado), el texto empieza a 'pasos, cada relativa y Nueva sesión aqu…' sin margen ni separación visible.
   - ej: prod/mobile-dark/post-studio
272. **[cosmetica] ×1** — input de mensaje (parte inferior): El placeholder 'Message... Type / for commands, @' tiene contraste muy bajo respecto al fondo del input y el texto es largo, ocupando casi todo el ancho disponible.
   - ej: prod/mobile-dark/post-studio
273. **[cosmetica] ×1** — barra inferior de controles (iconos izquierda): Los iconos de adjuntar/imagen, micrófono y ajustes son pequeños (~32-36px) y están muy juntos entre sí y respecto a 'Failover Fast', apretados en el borde inferior en móvil.
   - ej: prod/mobile-dark/post-studio
274. **[cosmetica] ×1** — opción A (tarjeta A): El texto se corta con asterisco ('sidebar-*') sin ellipsis ni indicación de que hay más contenido; la descripción queda incompleta sin forma evidente de verla completa.
   - ej: prod/mobile-dark/proposals
275. **[cosmetica] ×1** — parte inferior (opción D visible a medias): La última tarjeta aparece cortada por el borde inferior sin separación visual clara de fin de lista, pudiendo confundirse con un desbordamiento.
   - ej: prod/mobile-dark/proposals
276. **[cosmetica] ×1** — zona meta del mensaje (justo encima del input, izquierda): Aparece una 'R' suelta en una línea propia bajo '522 in · 1,078 out · 191,936 cache', con la fecha 'Oct 15 03:13 PM' partida en dos líneas: etiqueta de rol/autor truncada y wrap incorrecto del timestamp.
   - ej: prod/mobile-dark/session
277. **[cosmetica] ×1** — barra de acciones inferior (Failover Fast / More controls): Acciones en texto plano en la esquina inferior derecha con poco aire respecto al borde y sin separación clara respecto a los iconos (imagen/micro/ajustes) de la misma fila, jerarquía confusa en móvil.
   - ej: prod/mobile-dark/session
278. **[cosmetica] ×1** — filas de proyecto en el sidebar (glifo antes del texto): Aparece un glifo cuadrado vacío (tofu / icono no renderizado) en lugar del icono del proyecto en varias filas, mientras 'probe-cwd' no tiene icono y 'Rutina: reconcile' sí.
   - ej: prod/mobile-dark/sidebar-open
279. **[cosmetica] ×1** — borde derecho del drawer: contenido de la sesión detrás del sidebar: No hay scrim/oscurecimiento ni cierre visual: el contenido detrás queda a la misma luminosidad y cortado a media palabra/línea, lo que resta foco al menú abierto.
   - ej: prod/mobile-dark/sidebar-open
280. **[cosmetica] ×1** — cada fila de proyecto: botones '+' y '⋯' a la derecha: Los controles por fila son estrechos y están muy juntos entre sí y respecto al texto truncado, apretando el row en 390px.
   - ej: prod/mobile-dark/sidebar-open
281. **[cosmetica] ×1** — mismo evento 'caduca', línea de título y meta: Doble icono de casilla/checkbox duplicado al inicio ('▫▫ caduca') y repetición redundante de la fecha ('Miércoles 21-oct' en la descripción cuando ya está bajo el grupo 'Mié 21 Oct'), ruidando la jerarquía.
   - ej: prod/mobile-dark/timeline
282. **[cosmetica] ×1** — barra superior, 'Session info' y botón de panel (esquina superior derecha): 'Session info' en gris azulado sobre fondo oscuro con contraste bajo y muy pegado al botón de panel/cerrar de la derecha, separación mínima entre targets táctiles.
   - ej: prod/mobile-dark/timeline
283. **[cosmetica] ×1** — controles del composer (iconos imagen/micrófono): Iconos de adjuntar imagen y micrófono de tamaño táctil muy reducido (~20-24px) respecto al resto de la fila, difíciles de tocar en móvil.
   - ej: prod/mobile-light/home
284. **[cosmetica] ×1** — barra inferior de controles (icono imagen, micrófono, engranaje, 'Failover Fast', 'More controls'): Controles mezclados sin jerarquía: iconos pequeños a la izquierda junto a dos etiquetas de texto; 'Failover Fast' no tiene contenedor ni borde y los targets táctiles de los iconos son pequeños (<40px) para móvil.
   - ej: prod/mobile-light/post-studio
285. **[cosmetica] ×1** — chips de archivos (SessionSidebar.tsx, route.ts, etc.): Los chips se apilan en dos columnas irregulares con anchos muy dispares, generando un bloque visual desordenado en móvil.
   - ej: prod/mobile-light/post-studio
286. **[cosmetica] ×1** — tabs 'Pendientes (13)', 'Todas (104)' y filtro 'Por urgen…': Los iconos de los tabs se renderizan como cuadrados vacíos (glifo faltante / tofu), lo que da sensación de interfaz rota.
   - ej: prod/mobile-light/proposals
287. **[cosmetica] ×1** — badge 'Origen: Brief matutino · 20-10', línea inferior de la cabecera de la propuesta: El texto del badge parte la fecha '20-10' en dos líneas ('20-' / '10') por ancho insuficiente, rompiendo la lectura del dato.
   - ej: prod/mobile-light/proposals
288. **[cosmetica] ×1** — cabecera superior + primera línea del contenido: El texto del mensaje queda cortado a media línea justo bajo la barra superior ('pasos, cada relativa y Nueva sesión aqu'), sin separación ni desvanecido, da sensación de truncado.
   - ej: prod/mobile-light/session
289. **[cosmetica] ×1** — fecha del turno, esquina inferior derecha del mensaje: 'Oct 15 03:13 PM' se parte en dos líneas ('Oct 15 03:13' / 'PM'), wrap feo en una marca de tiempo.
   - ej: prod/mobile-light/session
290. **[cosmetica] ×1** — input de mensaje, borde derecho: El placeholder 'Message... Type / for commands, @' llega muy pegado al botón de envío, casi sin margen de seguridad.
   - ej: prod/mobile-light/session
291. **[cosmetica] ×1** — metadatos del turno (522 in · 1,078 out · cache): Texto en gris muy claro sobre fondo blanco, contraste bajo para información de contexto.
   - ej: prod/mobile-light/session
292. **[cosmetica] ×1** — Barra superior global, zona central-izquierda (entre el icono de carpeta y el '+'): Existe una celda vacía ancha sin contenido que ocupa espacio útil, mientras que a la derecha los controles (búsqueda, '↓ 85k 18%', toggle de panel) van apretados en 390px: la barra está desequilibrada.
   - ej: prod/mobile-light/sidebar-open
293. **[cosmetica] ×1** — Tarjeta 'Línea de tiempo', texto secundario 'pasado → próximo' (derecha de la tarjeta): Contraste bajo: gris muy claro sobre fondo blanco, apenas legible a tamaño pequeño en móvil.
   - ej: prod/mobile-light/sidebar-open
294. **[cosmetica] ×1** — iconos de cada evento de la lista (columna izquierda) y prefijo de eventos 'caduca': Los iconos/emojis no renderizan correctamente: se ven como cuadrados huecos (tofu), p.ej. '□ □ caduca: ...', sin significado visual alguno.
   - ej: prod/mobile-light/timeline
295. **[cosmetica] ×1** — fila superior (top bar, derecha): 'Session info' está en inglés dentro de una UI en español; mezcla de idioma en la navegación.
   - ej: prod/mobile-light/timeline
296. **[cosmetica] ×1** — zona principal, fila de controles bajo el composer: Controles amontonados en una sola línea (iconos imagen/micrófono, 'Failover Normal (Default)', 'auto', 'configured', 'Compact') con iconos pequeños poco diferenciados y sin agrupación clara.
   - ej: prod/tablet-dark/home
297. **[cosmetica] ×1** — sidebar, árbol FILES: Árbol de archivos muy extenso que empuja 'Settings' al fondo y obliga a scroll largo; la sección ocupa más altura que la lista de sesiones, desequilibrando el panel.
   - ej: prod/tablet-dark/home
298. **[cosmetica] ×1** — panel central, parte superior: El contenido empieza a mitad de una lista de bullets cortada por el borde superior, sin contexto visible del inicio del mensaje.
   - ej: prod/tablet-dark/post-studio
299. **[cosmetica] ×1** — Barra superior de filtros, extremo derecho junto al desplegable 'Por urgencia / caducidad': El botón icono del final queda cortado/pegado al borde derecho de la ventana, casi sin margen, y su glifo se ve parcial recortado.
   - ej: prod/tablet-dark/proposals
300. **[cosmetica] ×1** — Paginación inferior central: 'Decisión 1 de 13': Texto gris muy tenue sobre fondo oscuro, poco legible frente a los botones 'Anterior'/'Siguiente' que sí tienen contraste suficiente.
   - ej: prod/tablet-dark/proposals
301. **[cosmetica] ×1** — panel de chat, zona inferior antes del input: Los chips de archivos referenciados se apilan en 4 filas muy pegadas al campo de mensaje y al icono de envío, dejando la última fila ('SessionSidebar.test.mjs', 'route.ts') casi pegada al input sin separación clara.
   - ej: prod/tablet-dark/session
302. **[cosmetica] ×1** — sidebar izquierdo, lista de proyectos (sección bajo 'Hablar por Voz'): Nombres de proyecto truncados con puntos suspensivos ('Proyecto: wt-paneles-ma…') sin tooltip ni forma de ver el nombre completo
   - ej: prod/tablet-dark/timeline
303. **[cosmetica] ×1** — cabecera global superior derecha (iconos de toggle/paneles): Los iconos de la barra superior son pequeños y muy apretados entre sí, con targets táctiles apenas visibles para tablet
   - ej: prod/tablet-dark/timeline
304. **[cosmetica] ×1** — eventos de timeline (tarjetas con checkbox cuadrado a la izquierda): Los checkboxes de cada evento son iconos pequeños y muy juntos al texto, con target táctil reducido y sin padding de interacción claro
   - ej: prod/tablet-dark/timeline
305. **[cosmetica] ×1** — sidebar, lista de sesiones, fila 'Proyecto: wt-paneles-ma...': Nombre del proyecto truncado con puntos suspensivos ('wt-paneles-ma...') sin tooltip visible ni badge de sesiones completo a la derecha.
   - ej: prod/tablet-light/home
306. **[cosmetica] ×1** — toolbar superior, botones 'Full history' y 'Generate title': Etiquetas con contraste muy bajo (texto grisáceo sobre fondo claro), parecen deshabilitadas pero no hay estado hover ni indicador claro.
   - ej: prod/tablet-light/home
307. **[cosmetica] ×1** — FILES, pestañas de workspace '..human-ui' y '..egrador 12': Nombres truncados con prefijo '..' (p.ej. '..egrador 12'), difícil identificar el workspace al que corresponden.
   - ej: prod/tablet-light/home
308. **[cosmetica] ×1** — sidebar, sesión 'exohuman-ui' con 'No sessions yet': Estado vacío 'No sessions yet' en inglés mientras el resto de la UI está en español, y sin acción sugerida (CTA) para crear la primera sesión.
   - ej: prod/tablet-light/home
309. **[cosmetica] ×1** — toolbar superior, iconos junto al logo (+, actividad, filtro, buscar, panel): Grupo de 5 iconos sin etiqueta ni separación clara respecto a los botones con texto, jerarquía poco evidente en tablet.
   - ej: prod/tablet-light/home
310. **[cosmetica] ×1** — barra inferior de estados (Failover Fast, off, configured, Compact): Iconos de acciones (imagen, micrófono, volumen) muy pequeños y juntos en la barra inferior, con targets táctiles difíciles de pulsar en tablet.
   - ej: prod/tablet-light/post-studio
311. **[cosmetica] ×1** — área central, chips de archivos adjuntos (bottom: route.ts, SessionSidebar.test.mjs): Los chips de archivos se solapan con el borde superior del campo de mensaje, quedando parcialmente ocultos detrás del input.
   - ej: prod/tablet-light/post-studio
312. **[cosmetica] ×1** — Sidebar, lista de proyectos: primer elemento 'Proyecto: wt-paneles-ma...': Nombre de proyecto truncado con puntos suspensivos, mientras el badge '1' queda pegado al final; sin indicación visual de que hay tooltip/tooltip que revele el nombre completo.
   - ej: prod/tablet-light/proposals
313. **[cosmetica] ×1** — Sidebar, item 'Línea de tiempo' (arriba a la izquierda): La etiqueta se parte en dos líneas ('Línea de / tiempo') rompiendo el ritmo vertical frente al resto de items de una sola línea; el item queda más alto y desalineado.
   - ej: prod/tablet-light/proposals
314. **[cosmetica] ×1** — Panel derecho, fila de metadatos 'hace 8 horas' tras el badge SISTEMA: Texto en gris muy claro sobre fondo blanco: contraste bajo, apenas legible en tablet con brillo medio.
   - ej: prod/tablet-light/proposals
315. **[cosmetica] ×1** — panel izquierdo, lista de proyectos: El nombre 'Proyecto: wt-paneles-ma…' se trunca con puntos suspensivos sin tooltip visible ni forma de ver el nombre completo.
   - ej: prod/tablet-light/session
316. **[cosmetica] ×1** — área de chat, primer mensaje visible (arriba): El contenido del mensaje empieza cortado ('Canales ROI / Voz / FaceSearch…' sin viñeta inicial completa), indicando scroll intermedio con el inicio del mensaje fuera de vista.
   - ej: prod/tablet-light/session
317. **[cosmetica] ×1** — Sidebar, ítem 'Proyecto: wt-paneles-ma...' (primer proyecto de la lista): El nombre del proyecto se trunca con puntos suspensivos sin tooltip visible y además el badge de contador se solapa visualmente con el final del texto truncado.
   - ej: prod/tablet-light/timeline
318. **[cosmetica] ×1** — Sidebar, tarjeta 'Línea de tiempo' con 'pasado → próximo': El título se parte en dos líneas ('Línea de / tiempo') y la etiqueta 'pasado → próximo' también, quedando un bloque muy apretado y con línea base desalineada respecto al icono.
   - ej: prod/tablet-light/timeline
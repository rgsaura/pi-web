# ExoHuman UI — Especificación Canónica de Producto y Funcionalidades (SPEC)
**Versión:** 1.0.0 (Canónica)  
**Fecha de corte:** Octubre 2026  
**Propietario:** Rodrigo García / Sistema Personal EXOHUMAN  
**Entorno de Producción:** `http://exohuman.tail08ecb.ts.net:30141`  

---

## 1. Visión y Propósito
**ExoHuman UI** es el **centro de mando personal, operativo y cognitivo de Rodrigo García**.
Sustituye de forma definitiva la dispersión de terminales, servidores web efímeros, puertos huérfanos y dashboards aislados. Centraliza en una única experiencia web (optimizada al 100% para iPhone en Safari/PWA y Mac de escritorio) todo el control del sistema: **Decisiones de gobernanza, Encargos en curso, Actividad consolidada multicanal, Workspaces de proyectos, Sesiones de agentes y Entrada por Voz interactiva**.

---

## 2. Principios de Arquitectura y Reglas Innegociables

1. **Accionable en 1 Clic (Action-Oriented)**:
   - La interfaz no es un informe estático de lectura. Toda vista debe permitir operar inmediatamente: aprobar o descartar decisiones, saltar a la sesión viva de un encargo, pausar rutinas o dictar órdenes por voz.
2. **Observabilidad Estricta y Veracidad Real**:
   - **Prohibido inventar datos**: cero barras de progreso simuladas o porcentajes ficticios (ej. "progreso 40%" inventado). Si una tarea está en curso, se muestra el estado vivo, el tiempo transcurrido y el link directo a la sesión.
   - Si hay agentes corriendo en el sistema (Herdr, Pi subagents), el panel de sesiones vivas debe reflejarlos con total fidelidad (nunca indicar "0 sesiones" erróneamente).
3. **Centralización Total sin Servidores Huérfanos**:
   - Todo visor o entregable visual vive dentro de ExoHuman UI (como vista integrada o a través del visor de artefactos interno). Cero páginas HTML sueltas en `~/srv` o `~/tmp` ni puertos web dispersos.
4. **Aislamiento Prod vs Sandboxes (Forks de Preview)**:
   - **Producción estable** corre en el puerto `:30141` compilada y protegida.
   - Toda nueva iteración o desarrollo de agentes se despliega en ramas/worktrees con URLs alternativas de previsualización (sandboxes) para prueba de Rodrigo antes del merge final a producción.
5. **Mobile-First & Touch-Safe (iPhone / Safari PWA)**:
   - Safe areas estrictas (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
   - Status bar integrada (`black-translucent`), navegación inferior nativa en móvil, targets táctiles mínimos de 40px y cero scrolls horizontales involuntarios.

---

## 3. Arquitectura de Navegación y Vistas de Primer Nivel

La navegación se estructura en 4 vistas centrales, 1 visor de artefactos y 1 modal continuo de voz:

### A. 🎯 Decisiones (Gobernanza y Propuestas Pendientes)
*Sustituye la antigua sección de "Propuestas" con un modelo formal de toma de decisiones.*

- **Diseño Visual de Alto Impacto**:
  - Categorización cromática clara y emoticonos representativos por ámbito (⚡ Sistema, 💼 Negocio/FaceSearch, 🎭 Ocio/Cultura, ⚙️ Infraestructura).
  - Título conciso del dilema + 1 sola línea de contexto claro.
  - Cero duplicidades en las opciones.
- **Acciones Directas en 1 Clic**:
  - Botones destacados para cada alternativa de decisión (ej: `Opción A: Migrar hoy`, `Opción B: Mantener actual`).
  - Botón directo de **Descartar / Rechazar** para retirar propuestas irrelevantes o no deseadas.
  - Resolución asíncrona: al pulsar, el backend registra la decisión en el ledger (`rg-proposal resolve`) y actualiza la UI al instante sin recarga.
- **Caducidad y Frescura**:
  - Indicador visible de caducidad ("Expira en 4h", "Vence hoy a las 20:00").
  - Filtrado estricto: la bandeja activa muestra únicamente decisiones vivas (nunca propuestas caducadas o ya atendidas).
  - Pestaña / selector de **Historial** para consultar y auditar decisiones tomadas o descartadas en el pasado.

---

### B. ⏳ Encargos (Ledger Vivo de Tareas)
*Gestión transparente y en tiempo real de todo lo que Rodrigo encarga al sistema (`rg-encargo`).*

- **Listado Estructurado por Estados**:
  - **En curso**: Tareas que están siendo ejecutadas en este momento por agentes o rutinas.
  - **En cola (Pendientes)**: Tareas planificadas a la espera de ejecución.
  - **Completados**: Historial reciente de encargos finalizados con recibo auditable.
- **Enlace Directo a Sesiones de Trabajo**:
  - Todo encargo en curso incluye un botón directo clicable: `[Abrir Sesión Pi]` o `[Ver en Herdr]`, que lleva a la URL de la sesión interactiva (`/?session=<id>`) para inspeccionar el razonamiento y herramientas en tiempo real.
- **Métricas Reales vs Ficticias**:
  - Eliminación de barras de porcentaje inventadas.
  - Se muestra: Dificultad asignada (Baja, Media, Alta), tiempo desde creación, subagente/proceso a cargo y estado cualitativo real (ej: "Investigando fuentes...", "Generando spec...").
- **Acciones en la Tarjeta**:
  - Marcar como completado manualmente.
  - Cancelar o reintentar encargo.

---

### C. ⚡ Actividad Multicanal (Feed Operativo en Vivo)
*Línea de tiempo consolidada de todos los eventos relevantes del sistema.*

- **Atribución Clara de Origen**:
  - Badge visual e icono del canal de procedencia:
    - 🔵 **Telegram ROT** (instrucciones directas o notas de voz de Rodrigo).
    - 🟢 **Beeper / WhatsApp** (mensajería externa o contactos).
    - 🟣 **Sesiones de Agente (Pi / Herdr)** (tareas autónomas en segundo plano).
    - 🟠 **Sentinel / FaceSearch** (alertas de negocio, pagos Stripe o tráfico).
    - ⚪ **Rutinas del Sistema** (timers programados, respaldos, comprobaciones).
- **Control de Ruido y Filtro de Sesiones Activas**:
  - Conmutador rápido: **"Activas ahora"** (muestra únicamente sesiones con actividad en los últimos 15-30 minutos).
  - Títulos limpios y legibles: prohibido volcar logs crudos; se expone el hito concreto (ej: "Informe de ocio Madrid completado", "Backup sincronizado").
- **Inspección Profunda**:
  - Clic en cualquier evento para desplegar el resumen ejecutivo, links asociados y sesión de trabajo origen.

---

### D. 🚀 Workspaces & Proyectos Activos
*Hub de acceso y supervisión de los proyectos clave de Rodrigo.*

- **Proyectos de Primer Nivel**:
  - **FaceSearch.app**: Métricas de visitas, estado de Stripe checkout, estado de conversiones y salud de contenedores.
  - **ExoHuman (Core & UI)**: Estado de la memoria personal EXO, réplicas Syncthing, salud de VM101 y CT126.
  - **ViralMerch**: Estado del VPS en Hetzner (37.27.46.190), contenedores y despliegues.
- **Atajos Operativos**:
  - Acceso directo al repositorio GitHub (`gh`), links a URLs públicas de producción, consolas de servicio y logs recientes.

---

### E. 🖥️ Visor de Artefactos e Interfaces Integradas
*Entorno nativo para previsualizar y operar herramientas visuales sin dispersión.*

- **Contenedor Seguro (Sandbox Iframe)**:
  - Espacio centralizado para renderizar interfaces de proyectos (ej. paneles de informes, visores gráficos, interfaces interactivas de utilidades).
  - Conexión directa con la sesión de Pi que generó el artefacto.
- **Cero Interfaces Huérfanas**:
  - Cualquier herramienta visual generada por un agente se monta automáticamente dentro del visor de artefactos, accesible mediante pestaña o split pane.

---

### F. 🎙️ Modal de Voz Interactivo (Voice Input / Output)
*Interacción continua mediante voz desde cualquier vista de la UI.*

- **Disparador Ergonómico**:
  - Botón flotante accesible desde móvil (esquina inferior derecha táctil) y escritorio.
- **Grabación y Transcripción Local**:
  - Grabación directa desde el navegador (Web Audio API / MediaRecorder).
  - Envío automático al endpoint de voz de Exohuman (`/api/voice` -> Whisper local).
  - Cero latencia en la transcripción.
- **Respuesta Contextual y Audio**:
  - Ejecución de la orden por ROT / agentes.
  - Respuesta en texto y, si el usuario lo activa o está en modo manos libres, audio nativo generado con la voz de Álvaro (`es-ES-AlvaroNeural`).

---

## 4. Especificación del Sidebar y Gestión de Sesiones

Para evitar la confusión detectada en versiones previas (rutinas proactivas que ocultaban el área real de trabajo o nombres genéricos):

1. **Nomenclatura Clara y Enriquecida**:
   - Cada sesión en el sidebar debe mostrar:
     - **Título significativo**: área específica y acción concreta (ej: `[Ocio] Agenda Madrid 16-19 oct`, `[FaceSearch] Fix Stripe Checkout`), NUNCA un genérico "Sesión proactiva de mejora".
     - **Fecha y Hora legible**: (ej. `Hoy, 15:30` o `16 Oct, 11:20`).
     - **Indicador de Estado Vivo**: Punto verde palpitante si la sesión está corriendo en segundo plano; gris si está inactiva o cerrada.
2. **Jerarquía y Trazabilidad de Canales (Sesión Padre -> Subsesiones)**:
   - Capacidad de expandir una sesión principal (ej. sesión de ROT en Telegram) para ver las subsesiones o agentes delegados que nacieron de ella.
3. **Limpieza del Pie del Sidebar**:
   - Eliminación del menú pop-up inferior duplicado de "Propuestas / Tareas".
   - En la parte inferior solo se mantiene el acceso a Configuración y Perfil de Usuario.
4. **No Oclusión de Consola**:
   - La apertura de vistas (Decisiones, Encargos, Actividad, Workspaces) se realiza de forma limpia sin superponerse como modales rotos sobre la consola activa; soporte de regreso fluido y layouts divididos en escritorio.

---

## 5. Requisitos Técnicos y de Despliegue

| Componente | Especificación Canónica |
| :--- | :--- |
| **Framework Base** | Next.js 16 (App Router), React 19, TypeScript |
| **Estilos & UI** | Tailwind CSS v4, Lucide React Icons |
| **Internacionalización** | Español (es-ES) canónico en todas las vistas y strings |
| **Diseño Móvil** | Full PWA (Service Worker, Manifest v2, safe-areas de iOS Safari) |
| **Backing Services** | Integración directa con CLI/APIs locales (`rg-encargo`, `rg-proposal`, `exo-now`, Pi RPC, Herdr socket) |
| **Producción** | Puerto `:30141` en VM101 (systemd unit `piweb.service`) |
| **Sandboxes / Forks** | Worktrees con puertos aislados (`:30142+`) y URLs expuestas en Tailnet para validación previa |

---

## 6. Criterios de Aceptación y Pruebas (Definition of Done)
1. **Verificación en seco**: Ninguna vista se despliega a producción sin haber superado los tests e2e de consola, carga móvil y visualización limpia.
2. **Cero errores de hydration**: Carga inmediata sin saltos de layout en iPhone Safari.
3. **Flujo de Decisiones verificado**: Pulsar una opción actualiza el estado en menos de 300ms y refleja la resolución.
4. **Flujo de Encargos verificado**: Todo encargo en curso tiene su link funcional a la sesión de trabajo.

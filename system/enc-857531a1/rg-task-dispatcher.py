#!/usr/bin/env python3
"""
rg-task-dispatcher.py — Despachador nativo de encargos a ExoHuman UI (:30141).
Despacha tareas pendientes directamente a través de la API RPC nativa de ExoHuman UI (/api/agent/new).

ENRUTADO CANÓNICO (enc-d0a2bda9, 2026-10-20):
  - CERO heurísticas de palabras clave y CERO árbol compartido.
  - La categoría del encargo (rg-encargo add --category) resuelve el proyecto vía
    ~/.config/exohuman/routing.json (categoryRoutes). Proyecto desconocido → general.
  - Proyecto git → cada encargo arranca en su PROPIO worktree aislado
    wt-<hex8> con rama fork/<hex8> (rama base: main) y puerto dev del registro
    (rg-port). Proyecto no-git → sesión en su base, sin worktree.
  - Si la creación del worktree falla, NO se despacha al árbol compartido:
    se reintenta en el siguiente ciclo.

AGENTES A MEDIDA + PREVIEW-FIRST (enc-126d5a2e, 2026-10-20):
  - Cada encargo se despacha con un BRIEF A MEDIDA según su perfil:
    ~/.config/exohuman/brief-profiles.json define el perfil por (categoría,
    fase) — ui-preview, ui-build, sistema-ops, social, investigacion,
    code-build — con contexto exacto, reglas, qué NO tocar y verificación.
  - PROTOCOLO PREVIEW-FIRST: mejoras de UI en DOS fases. F1 (fase=preview o
    categoría=preview) → preview funcional MÍNIMA de sólo el cambio, con
    comparativa antes/después (panel) para el OK de Rodrigo; F2 (fase=
    completo, encargo hijo) → implementación completa con tests tras su OK.
  - --self-test: verifica enrutado + perfiles + preview-first + rutas
    referenciadas en perfiles + creación/retirada real de worktree sin
    despachar nada.

RUTAS VIVAS EN PERFILES (enc-857531a1, 2026-10-23 · prop-e0bcbbfb):
  - El perfil code-build mandaba leer ~/.local/share/context/projects/
    <proyecto>.md. El dir EXISTE y está poblado en el host, pero los briefs se
    consumen en el sandbox (contenedor api), que NO monta ~/.local/share: la
    referencia llegaba MUERTA a cada sesión despachada (de ahí el 'no existe
    en la VM' de la propuesta: verificado con find desde el sandbox). El perfil
    queda reenlazado a fuentes visibles desde la sesión: AGENTS.md del repo
    (contexto canónico por proyecto, lo hereda el worktree) +
    ~/.config/exohuman/docs/MAPA-DEL-SISTEMA.md.
  - --self-test comprueba además que TODA ruta referenciada en los perfiles
    (1) exista y (2) sea visible para el sandbox (raíces que monta el contenedor
    api — fuente deploy/compose.yaml, cross-check en el self-test — más /tmp y
    ~/.cache, locales de cada sandbox). Rutas con <placeholder> o /** se
    validan por su prefijo real más largo ('~/.cache/<encargo>' → '~/.cache').
    Referencia muerta = no existe, o existe en el host pero es invisible para
    la sesión: el self-test FALLA en ambos casos y el detector se prueba en
    seco con ambos.

FIX CONTEO DE ACTIVOS (enc-7bfd0c2a, 2026-10-22):
  - Incidente 22-10 ~09:45: contar como activa cualquier sesión con jsonl
    escrito hace <45 min (fix 2026-10-21) incluía sesiones YA terminadas:
    "16/16" fantasma con slots reales libres y RAM sobrante mientras la UI
    (Actividad, vía ps) mostraba 6 vivas.
  - Ahora una sesión cuenta como activa sólo con SEÑAL DE VIDA REAL:
      1) API de la UI: /api/agent/running (running + awaiting input, sesiones
         en proceso del servidor).
      2) PROCESO real vía ps, casado por ARGS (namespace-agnóstico; los pid
         de runs/*.json NO valen entre instancias — enc-8e2c8148): wrappers
         detached `pi-web-detached/wrappers/<uuid>.sh` y cualquier
         `pi --session-id <uuid>` visible (mismas señales que parsePiSessions
         de system-map en la UI).
      3) Fallback mtime REBAJADO a 15 min Y con evidencia de progreso: el
         jsonl debe haber CRECIDO desde el ciclo anterior (fresco sin crecer
         = terminada = libera slot). Cubre pi manual en terminal u otras
         instancias que comparten ~/.pi sin proceso visible aquí.
    Una viva silenciosa >10 min NO se suelta: su proceso (señal 2) la mantiene
    contada aunque su jsonl no escriba (el reconciler mantiene su gracia de
    45 min para reencolar). --count-probe: desglose en sólo-lectura.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
ROUTING = HOME / ".config/exohuman/routing.json"
BRIEF_PROFILES = HOME / ".config/exohuman/brief-profiles.json"
RG_WORKTREE = str(HOME / ".local/bin/rg-worktree")

LEDGER = HOME / ".local/state/encargos/ledger.json"
STATE = HOME / ".local/state/routines"
STATE.mkdir(parents=True, exist_ok=True)
LOG_FILE = STATE / "task-dispatcher.log"

MIN_AVAILABLE_RAM_MB = 1000
UI_BASE = "http://127.0.0.1:30141"

# FIX enc-7bfd0c2a (2026-10-22): señales de vida reales para contar activos.
# El mtime fresco por sí solo contaba sesiones terminadas (fantasmas 16/16).
SESSIONS_DIR = HOME / ".pi/agent/sessions"
PROGRESS_STATE = STATE / "task-dispatcher-progress.json"   # (sid → size,mtime) por ciclo
MTIME_FALLBACK_WINDOW = 15 * 60   # antes 45 min: sólo fresco + creciendo
DETACHED_WRAPPER_RE = re.compile(
    r"pi-web-detached/wrappers/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.sh")
SESSION_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{ts}] {msg}\n")
    print(f"[{ts}] {msg}")


def load_routing():
    try:
        return json.loads(ROUTING.read_text())
    except Exception as e:
        log(f"FALLO CRÍTICO: no puedo leer {ROUTING}: {e}")
        return None


def load_profiles():
    try:
        return json.loads(BRIEF_PROFILES.read_text())
    except Exception as e:
        log(f"FALLO: no puedo leer {BRIEF_PROFILES}: {e}")
        return None


# ── RUTAS REFERENCIADAS EN PERFILES (prop-e0bcbbfb, enc-857531a1) ─────────
# Un perfil manda leer/usar rutas concretas; una referencia muerta llegaba
# intacta a cada sesión despachada porque nadie la validaba. Ojo: el dispatcher
# corre en el HOST pero los briefs se consumen en el SANDBOX (contenedor api) —
# una ruta puede existir en el host y seguir siendo invisible para la sesión.
PATH_REF_RE = re.compile(r"(?:~|/tmp|/home|/opt|/var|/etc|/usr|/srv|/mnt)/[^\s,;:()\"'`]+")

# Raíces que el contenedor api monta (fuente: deploy/compose.yaml, servicio
# api). Comprobadas contra el compose en el self-test para no derivar en silencio.
SANDBOX_MOUNTED_ROOTS = (
    "/home/rgsaura/.pi",
    "/home/rgsaura/workspaces",
    "/home/rgsaura/.local/share/exohuman",
    "/home/rgsaura/.local/state",
    "/home/rgsaura/.config/exohuman",
    "/home/rgsaura/.local/bin",
)
# Raíces locales del propio sandbox (existen y son escribibles en cada sesión,
# sin esperar nada del host): /tmp y ~/.cache (zonas de escritura de los briefs).
SANDBOX_LOCAL_ROOTS = ("/tmp", str(HOME / ".cache"))
COMPOSE_API = HOME / "workspaces/exohuman/ui/deploy/compose.yaml"


def compose_mounted_roots(compose_path=None):
    """{host_paths montados por los servicios del compose} o None si no legible."""
    p = compose_path or COMPOSE_API
    try:
        text = Path(p).read_text()
    except Exception:
        return None
    return set(re.findall(r"^\s*-\s+(/home/[^:\s]+):", text, flags=re.M))


def resolve_path_ref(token):
    """Token de ruta → Path a validar (None si nada comprobable). '<placeholder>'
    y '/**' se resuelven a su prefijo real más largo: '~/.cache/<encargo>' →
    '~/.cache' (existe), '~/.local/state/**' → '~/.local/state'."""
    t = token.rstrip(".,;:")
    while t.endswith("*"):
        t = t[:-1]
    t = t.rstrip("/")
    if "<" in t:
        t = t.split("<", 1)[0].rstrip("/")
    if not t or t == "~":
        return None
    if t.startswith("~"):
        t = str(HOME) + t[1:]
    return Path(t)


def _under(path, roots):
    return any(str(path) == r or str(path).startswith(r.rstrip("/") + "/") for r in roots)


def profile_path_refs(profiles):
    """{token_de_ruta: [perfiles]} de toda ruta referenciada en los perfiles."""
    refs = {}
    for name, p in sorted((profiles or {}).get("profiles", {}).items()):
        fields = [p.get("objetivo", ""), p.get("verificacion", ""), p.get("done", "")]
        for key in ("contexto", "reglas", "no_tocar"):
            fields.extend(p.get(key) or [])
        for field in fields:
            if not isinstance(field, str):
                continue
            for tok in PATH_REF_RE.findall(field):
                refs.setdefault(tok, []).append(name)
    return refs


def check_profile_paths(profiles):
    """(n_referencias, [(token, perfiles, validado, motivo)]) — referencias
    muertas: 'no existe' en el host, o 'invisible para el sandbox' (fuera de
    las raíces que monta el contenedor api y de las locales del sandbox)."""
    ok_roots = tuple(SANDBOX_MOUNTED_ROOTS) + tuple(SANDBOX_LOCAL_ROOTS)
    refs = profile_path_refs(profiles)
    dead = []
    for tok, owners in sorted(refs.items()):
        resolved = resolve_path_ref(tok)
        if resolved is None:
            continue
        if not resolved.exists():
            dead.append((tok, sorted(set(owners)), str(resolved), "no existe"))
        elif not _under(resolved, ok_roots):
            dead.append((tok, sorted(set(owners)), str(resolved),
                         "invisible para el sandbox (fuera de las raíces del contenedor api)"))
    return len(refs), dead


def profile_for(cat, fase, profiles):
    """(categoría, fase) → perfil de brief. Tabla explícita, cero heurísticas."""
    tabla = (profiles or {}).get("profileByCategory", {})
    entry = tabla.get(cat) or tabla.get(str(cat).strip().lower())
    if not entry:
        return (profiles or {}).get("defaultProfile", "investigacion")
    return entry.get(fase) or entry.get("completo") or (profiles or {}).get("defaultProfile", "investigacion")


def route(categoria, cfg):
    """categoria → (project_key, project_cfg). Sin heurísticas: sólo routing.json."""
    routes = cfg.get("categoryRoutes", {})
    projects = cfg.get("projects", {})
    key = routes.get(categoria) or routes.get(str(categoria).strip().lower())
    if key not in projects:
        key = cfg.get("categoryFallback", "general")
    return key, projects[key]


def prepare_worktree(eid, project_key, proj):
    """Crea el worktree aislado del encargo. → dict(name,path,branch,base,baseBranch,port) o None."""
    try:
        out = subprocess.run(
            [RG_WORKTREE, "create", eid, "--project", project_key],
            capture_output=True, text=True, timeout=120)
        if out.returncode == 0 and out.stdout.strip():
            return json.loads(out.stdout.strip().splitlines()[-1])
        log(f"worktree create falló para {eid}: {out.stderr.strip() or out.stdout.strip()}")
    except Exception as e:
        log(f"excepción creando worktree para {eid}: {e}")
    return None


def build_prompt(eid, titulo, desc, route_info, profile=None, fase="completo"):
    """Brief ACOTADO y A MEDIDA: objetivo + perfil (contexto/reglas/no tocar/
    verificación) + contexto de enrutado + protocolo done. Preview-first si
    fase=preview."""
    ctx_lines = []
    if route_info.get("worktree"):
        ctx_lines.append(
            f"- Worktree propio aislado: `{route_info['worktree']['path']}` (rama `{route_info['worktree']['branch']}`, base `{route_info['worktree']['baseBranch']}`). Trabaja SÓLO aquí; nunca en el árbol base compartido."
        )
        if route_info["worktree"].get("port"):
            ctx_lines.append(
                f"- Puerto dev asignado (registro rg-port): {route_info['worktree']['port']}. PRODUCCIÓN :30141 y PRE :30149 intocables; nunca arranques segundo `next dev` en otro puerto del mismo árbol."
            )
        ctx_lines.append(
            "- Al terminar: commitea al fork. El merge a main SOLO tras aprobación de Rodrigo por el puerto de prueba."
        )
    else:
        ctx_lines.append(
            f"- Sesión en `{route_info['cwd']}` (proyecto sin repo). Las piezas de sistema (routines/units/config) se editan por ruta absoluta según el skill system-creation."
        )

    p = profile or {}
    fase_tag = " · FASE PREVIEW (F1): preview mínima, SIN implementación completa" if fase == "preview" else ""
    brief = (
        f"ENCARGO OFICIAL ({eid}): {titulo}{fase_tag}\n\n"
        f"DESCRIPCIÓN COMPLETA:\n{desc}\n\n"
    )
    if p:
        brief += (
            f"PERFIL DE TRABAJO — {p.get('nombre', '')}: {p.get('objetivo', '')}\n"
            "CONTEXTO EXACTO (léelo antes de empezar, nada más):\n"
            + "\n".join(f"- {c}" for c in p.get("contexto", [])) + "\n"
            "REGLAS:\n"
            + "\n".join(f"- {r}" for r in p.get("reglas", [])) + "\n"
            "NO TOCAR:\n"
            + "\n".join(f"- {n}" for n in p.get("no_tocar", [])) + "\n"
            f"VERIFICACIÓN OBLIGATORIA: {p.get('verificacion', 'tests/probes reales')}\n\n"
        )
    brief += (
        "CONTEXTO Y REGLAS:\n"
        + "\n".join(ctx_lines) + "\n"
        "- Resuelve de forma autónoma y verifica con tests/probes antes de finalizar.\n"
        "- Al concluir, ejecuta obligatoriamente:\n"
    )
    done_cmd = p.get("done") or f'rg-encargo done {eid} --title "<título conciso>" --summary "<resumen concreto de 1-2 frases>"'
    brief += "  " + done_cmd.replace("<eid>", eid) + "\n"
    return brief


def get_max_concurrent_agents():
    gov_file = HOME / ".local/state/routines/token-governor/state.json"
    if gov_file.exists():
        try:
            d = json.loads(gov_file.read_text())
            mode = d.get("mode", "turbo")
            if mode == "turbo":
                return 16
            elif mode == "eco":
                return 4
        except Exception:
            pass
    return 8


def get_available_ram_mb():
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 2048


def ui_live_session_ids():
    """Ids vivos según la API de la UI: sesiones EN PROCESO del servidor
    (running + awaiting input). Las detached NO están aquí de forma fiable
    (el probe de pid de /api/agent/running es cross-namespace: enc-8e2c8148):
    el dispatcher las ve vía ps."""
    for endpoint in (f"{UI_BASE}/api/agent/running", f"{UI_BASE}/api/sessions"):
        try:
            req = urllib.request.Request(endpoint)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            ids = set(data.get("runningSessionIds", []))
            ids |= set(data.get("awaitingInputSessionIds", []))
            return ids
        except Exception:
            continue
    return set()


def ps_live_session_ids(ps_args=None):
    """Ids de sesiones con PROCESO real vivo, casados por ARGS en `ps`
    (namespace-agnóstico: el host ve los procesos de todos los contenedores;
    un pid numérico NO vale entre namespaces — enc-8e2c8148). Señales, las
    mismas que parsePiSessions de system-map en la UI:
      - wrapper detached: /bin/sh ~/.pi/agent/pi-web-detached/wrappers/<uuid>.sh
        (vive exactamente lo que vive su `pi --print`)
      - `pi --session-id <uuid>` / `--session <uuid>` visible en args."""
    if ps_args is None:
        try:
            out = subprocess.run(["ps", "-eo", "args"], capture_output=True,
                                 text=True, timeout=10)
            ps_args = out.stdout
        except Exception:
            return set()
    ids = set()
    for line in ps_args.splitlines():
        if "pi-web.js" in line:
            continue  # el servidor pi-web no es una sesión
        m = DETACHED_WRAPPER_RE.search(line)
        if m:
            ids.add(m.group(1))
            continue
        parts = line.split()
        for i in range(len(parts) - 1):
            if parts[i] in ("--session-id", "--session") and SESSION_ID_RE.match(parts[i + 1]):
                ids.add(parts[i + 1])
    return ids


def sessions_with_progress(now=None, sessions_dir=None, state_file=None, persist=True):
    """Fallback mtime con EVIDENCIA DE PROGRESSO (enc-7bfd0c2a): cuenta sólo
    jsonl fresco (<MTIME_FALLBACK_WINDOW) que además CRECIÓ desde el ciclo
    anterior (o es primer avistamiento). Fresco sin crecer = sesión ya
    terminada = fantasma que libera slot. Cubre sesiones que escriben sin
    proceso visible aquí (pi manual en terminal, instancias de otro host que
    comparten ~/.pi)."""
    now = time.time() if now is None else now
    sessions_dir = SESSIONS_DIR if sessions_dir is None else sessions_dir
    state_file = PROGRESS_STATE if state_file is None else state_file
    try:
        prev = json.loads(state_file.read_text()) if state_file.exists() else {}
    except Exception:
        prev = {}
    alive = set()
    snap = {}
    try:
        for f in sessions_dir.rglob("*.jsonl"):
            try:
                sid = f.stem.rsplit("_", 1)[-1]
                st = f.stat()
                snap[sid] = {"size": st.st_size, "mtime": st.st_mtime}
                if now - st.st_mtime >= MTIME_FALLBACK_WINDOW:
                    continue
                old = prev.get(sid)
                if old is None or st.st_size > old.get("size", -1):
                    alive.add(sid)
            except OSError:
                continue
    except Exception:
        pass
    if persist:
        try:
            state_file.write_text(json.dumps(snap))
        except Exception:
            pass
    return alive


def get_active_ui_sessions_detail(persist=True):
    """{count, ui, procs, progress}: UNIÓN de las tres señales de vida real.
    count es el número que decide cuántos slots quedan libres."""
    ui = ui_live_session_ids()
    procs = ps_live_session_ids()
    progress = sessions_with_progress(persist=persist)
    return {"count": len(ui | procs | progress), "ui": len(ui),
            "procs": len(procs), "progress": len(progress)}


def get_active_ui_sessions_count():
    return get_active_ui_sessions_detail()["count"]


def dispatch_task(eid, task, cfg, profiles):
    desc = task.get("descripcion", "")
    titulo = task.get("titulo", desc[:40])
    cat = task.get("categoria", "general")
    fase = task.get("fase") or ("preview" if cat == "preview" else "completo")

    project_key, proj = route(cat, cfg)
    profile = (profiles or {}).get("profiles", {}).get(profile_for(cat, fase, profiles)) or None

    project_key, proj = route(cat, cfg)

    worktree = None
    if proj.get("git"):
        worktree = prepare_worktree(eid, project_key, proj)
        if not worktree:
            return False  # reintenta el próximo ciclo; NUNCA al árbol compartido
        cwd = worktree["path"]
    else:
        cwd = proj["base"]

    route_info = {"project": project_key, "cwd": cwd, "worktree": worktree}
    prompt = build_prompt(eid, titulo, desc, route_info, profile=profile, fase=fase)

    try:
        req = urllib.request.Request(
            f"{UI_BASE}/api/agent/new",
            data=json.dumps({
                "cwd": cwd,
                "type": "prompt",
                # enc-7c2d78ac: sesión en proceso propio (systemd scope) que
                # sobrevive reinicios de producción.
                "detached": True,
                "message": prompt
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            session_id = data.get("sessionId")
            if not session_id:
                log(f"Error iniciando sesión nativa para {eid}: {data}")
                return False
    except Exception as e:
        log(f"Error invocando API nativa de ExoHuman para {eid}: {e}")
        return False

    task["status"] = "pending"
    task["despachado"] = True
    task["sessionId"] = session_id
    task["session_tab_id"] = None
    task["despachado_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    # enc-fix-2026-10-21: reiniciar el contador de reintentos en cada despacho
    # exitoso; el acumulador de por vida congelaba encargos para siempre.
    task["dispatch_retries"] = 0
    task["cwd"] = cwd
    task["project"] = project_key
    task["fase"] = fase
    task["perfil"] = profile_for(cat, fase, profiles) if profiles else None
    if worktree:
        task["worktree"] = worktree["path"]
        task["branch"] = worktree["branch"]
        task["port"] = worktree.get("port") or ""

    log(f"Despachado {eid} -> sesión {session_id} (proyecto {project_key}, cwd {cwd}, "
        f"worktree {worktree['name'] if worktree else '-'})")

    web_url = f"http://100.76.45.22:30141/?session={session_id}"
    msg_title = "🚀 Encargo en marcha (ExoHuman UI)"
    msg_text = f"📋 *{titulo}*\n📁 `{cwd}`\n🔗 [Abrir en ExoHuman UI]({web_url})"
    try:
        subprocess.run(["rg-notify", "--title", msg_title, "--text", msg_text], timeout=5)
    except Exception:
        pass

    return True


def self_test():
    """Verificación real sin despachar: enrutado + perfiles + preview-first +
    ciclo worktree."""
    cfg = load_routing()
    assert cfg, "routing.json ilegible"
    profiles = load_profiles()
    assert profiles, "brief-profiles.json ilegible"
    expectations = {
        "ui": "exohuman-ui", "sistema": "exohuman-ui", "social": "exohuman-ui",
        "preview": "exohuman-ui",
        "facesearch": "facesearch", "storylater": "storylater", "wallapop": "wallapop",
        "bot": "general", "personal": "general", "general": "general",
        "categoria-inventada": "general",
    }
    for cat, expected in expectations.items():
        key, proj = route(cat, cfg)
        assert key == expected, f"route({cat}) = {key}, esperaba {expected}"
        assert (HOME / proj["base"]).exists() or proj["base"] == str(HOME), f"base inexistente para {key}: {proj['base']}"
    # perfiles: (categoría, fase) → perfil definido, sin heurísticas
    prof_expect = {
        ("ui", "preview"): "ui-preview", ("ui", "completo"): "ui-build",
        ("preview", "completo"): "ui-preview",
        ("sistema", "completo"): "sistema-ops",
        ("social", "completo"): "social",
        ("facesearch", "completo"): "code-build",
        ("general", "completo"): "investigacion",
        ("inventada", "completo"): "investigacion",
    }
    for (cat, fase), expected in prof_expect.items():
        got = profile_for(cat, fase, profiles)
        assert got == expected, f"profile_for({cat},{fase}) = {got}, esperaba {expected}"
        assert got in profiles["profiles"], f"perfil {got} no está definido"
    # ── prop-e0bcbbfb (enc-857531a1): rutas referenciadas en perfiles ──────
    # Toda ruta que un perfil manda leer/usar debe existir Y ser visible para
    # el sandbox donde se consumen los briefs (contenedor api): las referencias
    # muertas llegaban intactas a cada sesión despachada.
    n_refs, dead = check_profile_paths(profiles)
    assert not dead, "referencias muertas en perfiles: " + "; ".join(
        f"{tok} → {res} [{motivo}] (perfiles: {', '.join(own)})"
        for tok, own, res, motivo in dead)
    # cross-check: las raíces 'visibles' no deben derivar del deploy real
    compose_roots = compose_mounted_roots()
    if compose_roots is not None:
        assert compose_roots == set(SANDBOX_MOUNTED_ROOTS), (
            f"SANDBOX_MOUNTED_ROOTS desalineado con deploy/compose.yaml: "
            f"compose={sorted(compose_roots)} constante={sorted(SANDBOX_MOUNTED_ROOTS)}")
        print(f"RUTAS DE PERFILES: {n_refs} referencias verificadas · 0 muertas · "
              f"raíces del sandbox alineadas con compose ({len(compose_roots)})")
    else:
        print(f"RUTAS DE PERFILES: {n_refs} referencias verificadas · 0 muertas · "
              "compose no legible: cross-check de raíces omitido")
    # el detector se prueba en seco: una ruta inexistente DEBE caer, y la
    # regla de visibilidad debe marcar como invisible lo que queda fuera de
    # las raíces del sandbox aunque exista en el host (el motivo real de
    # prop-e0bcbbfb; la demostración en vivo está en el recibo del encargo).
    _, dead_fake = check_profile_paths(
        {"profiles": {"fake": {"contexto": ["~/.no-existe-enc-857531a1/<x>.md"]}}})
    assert dead_fake and dead_fake[0][3] == "no existe", \
        f"el detector no detecta una ruta inexistente: {dead_fake}"
    assert not _under(Path("/etc"), tuple(SANDBOX_MOUNTED_ROOTS) + tuple(SANDBOX_LOCAL_ROOTS)), \
        "la regla de visibilidad no marca lo que queda fuera de las raíces del sandbox"
    # ciclo real worktree
    eid = "enc-cafe1234"
    wt = prepare_worktree(eid, "exohuman-ui", cfg["projects"]["exohuman-ui"])
    assert wt and Path(wt["path"]).exists(), "create falló"
    try:
        assert wt["port"].isdigit() and 30145 <= int(wt["port"]) <= 30160, (
            f"puerto fuera de rango: {wt['port']!r} — pool 30145-30160 agotado o "
            f"rg-port alloc falló (revisa `rg-port list`: asignaciones de encargos "
            f"done que sólo libera el gc)")
        ri = {"project": "exohuman-ui", "cwd": wt["path"], "worktree": wt}
        # brief completo (ui-build): perfil + reglas + done
        prompt_build = build_prompt(eid, "t", "d", ri,
                                    profile=profiles["profiles"]["ui-build"], fase="completo")
        assert wt["path"] in prompt_build and "rg-encargo done" in prompt_build, "brief incompleto"
        assert "PERFIL DE TRABAJO" in prompt_build and "NO TOCAR" in prompt_build and "tsc --noEmit" in prompt_build, "brief ui-build sin contexto a medida"
        # brief preview (ui-preview): marcadores preview-first
        prompt_prev = build_prompt(eid, "t", "d", ri,
                                   profile=profiles["profiles"]["ui-preview"], fase="preview")
        for marker in ("FASE PREVIEW (F1)", "SIN implementación completa", "rg-panel new", "rg-proposal add", "PROHIBIDO en F1"):
            assert marker in prompt_prev, f"brief preview sin '{marker}'"
        r = subprocess.run([RG_WORKTREE, "remove", eid], capture_output=True, text=True, timeout=120)
        assert r.returncode == 0 and not Path(wt["path"]).exists(), "remove falló"
        subprocess.run(["git", "-C", str(HOME / "workspaces/exohuman/ui"), "branch", "-D", wt["branch"]],
                       capture_output=True, timeout=30)
    finally:
        # enc-7bfd0c2a: un assert fallido NUNCA deja el worktree de prueba huérfano
        if wt and Path(wt["path"]).exists():
            subprocess.run([RG_WORKTREE, "remove", eid, "--force"], capture_output=True, timeout=120)
        if wt:
            subprocess.run(["git", "-C", str(HOME / "workspaces/exohuman/ui"), "branch", "-D", wt["branch"]],
                           capture_output=True, timeout=30)

    # ── FIX enc-7bfd0c2a — R.1 EN SECO del conteo de activos ──────────────
    # Caso 1 (fantasma): jsonl FRESCO de sesión muerta (sin proceso, sin
    #   crecimiento) → libera slot. Caso 2 (viva silenciosa >10 min con
    #   proceso real) → NO se suelta. Caso 3: jsonl creciendo cuenta.
    uuid_ghost = "11111111-2222-3333-4444-555555555555"
    uuid_live = "66666666-7777-8888-9999-aaaaaaaaaaaa"
    uuid_grow = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"
    uuid_srv = "dddddddd-0000-0000-0000-000000000000"
    with tempfile.TemporaryDirectory() as td:
        tdir = Path(td)
        ghost = tdir / f"20261022_090000_{uuid_ghost}.jsonl"
        live = tdir / f"20261022_090100_{uuid_live}.jsonl"
        grow = tdir / f"20261022_090200_{uuid_grow}.jsonl"
        for f in (ghost, live, grow):
            f.write_text('{"type":"session"}\n')
        st_file = tdir / "progress.json"
        now = time.time()
        # ciclo 1: los tres frescos (primer avistamiento cuentan una vez);
        # live lleva 12 min silenciosa (aún dentro de ventana de 15 min)
        os.utime(ghost, (now - 60, now - 60))
        os.utime(live, (now - 12 * 60, now - 12 * 60))
        os.utime(grow, (now - 60, now - 60))
        a1 = sessions_with_progress(now=now, sessions_dir=tdir, state_file=st_file)
        assert uuid_ghost in a1 and uuid_grow in a1 and uuid_live in a1, \
            "primer avistamiento fresco debe contar"
        # ciclo 2 (CASO 1): ghost sigue FRESCO pero NO crece (terminada) → LIBERA SLOT;
        # live silenciosa también deja de contar por mtime (sin crecimiento)
        os.utime(ghost, (now - 10, now - 10))
        a2 = sessions_with_progress(now=now, sessions_dir=tdir, state_file=st_file)
        assert uuid_ghost not in a2, "FANTASMA: fresco sin crecer debe liberar slot (enc-7bfd0c2a)"
        assert uuid_live not in a2, "mtime solo no sostiene a la silenciosa sin crecimiento"
        # ciclo 3: grow creció → sigue contando (escribe sin proceso visible)
        grow.write_text('{"type":"session"}\n{"type":"message"}\n')
        os.utime(grow, (now - 5, now - 5))
        a3 = sessions_with_progress(now=now, sessions_dir=tdir, state_file=st_file)
        assert uuid_grow in a3, "jsonl creciendo debe contar"
    # CASO 2: viva silenciosa >10 min con PROCESO real (wrapper detached) NO se mata
    fake_ps = (
        "/bin/sh /home/rgsaura/.pi/agent/pi-web-detached/wrappers/%s.sh\n" % uuid_live
        + "/usr/local/bin/pi --print --session-id %s\n" % uuid_grow
        + "node /srv/pi-web/server/pi-web.js --session-id %s\n" % uuid_srv
        + "python3 /home/rgsaura/.local/bin/routines/rg-task-dispatcher.py --self-test\n"
    )
    ps_ids = ps_live_session_ids(fake_ps)
    assert uuid_live in ps_ids, "wrapper detached vivo debe contar por ps"
    assert uuid_grow in ps_ids, "pi --session-id visible debe contar por ps"
    assert uuid_srv not in ps_ids, "el servidor pi-web no es una sesión"
    # CASO 2 resuelto por la UNIÓN: viva silenciosa >10 min con proceso real
    # NO se suelta (la sostiene ps), mientras el fantasma sí libera slot.
    union = ps_ids | a2
    assert uuid_live in union, "viva silenciosa >10min con proceso NO se suelta"
    assert uuid_ghost not in union, "fantasma sin proceso ni progreso libera slot"
    assert uuid_grow in (ps_ids | a3), "sesión escribiendo cuenta (ps o progreso)"

    # sonda real en sólo-lectura: desglose vs señal vieja (fantasmas <45 min)
    detail = get_active_ui_sessions_detail(persist=False)
    now = time.time()
    fresh45 = 0
    try:
        for f in SESSIONS_DIR.rglob("*.jsonl"):
            try:
                if now - f.stat().st_mtime < 45 * 60:
                    fresh45 += 1
            except OSError:
                continue
    except Exception:
        pass
    print(f"SONDA REAL: activos {detail['count']} (UI {detail['ui']} · procesos "
          f"{detail['procs']} · progreso {detail['progress']}) · jsonl frescos<45min "
          f"(señal vieja que inflaba): {fresh45}")
    assert detail["count"] >= detail["procs"], "la unión nunca puede ser menor que una señal propia"

    print("SELF-TEST OK: enrutado + perfiles a medida + rutas de perfiles (existencia + visibilidad sandbox, 0 muertas) + preview-first + worktree + puerto + brief + conteo de activos (fantasma libera, viva silenciosa NO) verificados")
    return 0


def main():
    if "--self-test" in sys.argv:
        sys.exit(self_test())

    if "--count-probe" in sys.argv:
        # FIX enc-7bfd0c2a: desglose en sólo-lectura (no persiste snapshot,
        # no toca ledger, no despacha)
        d = get_active_ui_sessions_detail(persist=False)
        print(f"Activos: {d['count']}/{get_max_concurrent_agents()} "
              f"(UI {d['ui']} · procesos {d['procs']} · progreso {d['progress']})")
        return

    cfg = load_routing()
    if not cfg:
        return

    if not LEDGER.exists():
        return

    avail_ram = get_available_ram_mb()
    if avail_ram < MIN_AVAILABLE_RAM_MB:
        log(f"Memoria disponible baja ({avail_ram} MB < {MIN_AVAILABLE_RAM_MB} MB). Pausando...")
        return

    data = json.loads(LEDGER.read_text())
    encargos = data.get("encargos", {})

    profiles = load_profiles()
    if not profiles:
        log("Sin perfiles de brief (brief-profiles.json): despacho bloqueado para no lanzar sesiones genéricas por error.")
        return

    try:
        subprocess.run(["/home/rgsaura/.local/bin/routines/rg-task-reconciler.py"], timeout=10)
    except Exception:
        pass

    active_detail = get_active_ui_sessions_detail()
    active = active_detail["count"]
    limit = get_max_concurrent_agents()
    available_slots = max(0, limit - active)
    # enc-7bfd0c2a: telemetría por ciclo — la composición del conteo es justo
    # lo que el incidente 16/16-fantasma dejó ciego durante horas.
    log(f"Activos: {active}/{limit} (UI {active_detail['ui']} · procesos "
        f"{active_detail['procs']} · progreso {active_detail['progress']})")

    if available_slots <= 0:
        log(f"Capacidad máxima alcanzada ({active}/{limit} agentes activos en UI).")
        return

    pending_to_dispatch = []
    for k, v in sorted(encargos.items(), key=lambda x: x[1].get("creado", "")):
        if (v.get("status") == "pending" and not v.get("despachado")
                and not v.get("stalled")):
            # stalled = la sesión ha muerto MAX_DEATHS veces: requiere decisión
            # de Rodrigo (avisado por ROT); no se re-despacha en solitario.
            desc = v.get("descripcion", "")
            if len(desc) < 5:
                continue
            pending_to_dispatch.append((k, v))

    if not pending_to_dispatch:
        return

    log(f"Encontradas {len(pending_to_dispatch)} tareas pendientes. Despachando hasta {available_slots} slots...")
    dispatched_count = 0
    for eid, task in pending_to_dispatch[:available_slots]:
        if dispatch_task(eid, task, cfg, profiles):
            dispatched_count += 1
            time.sleep(2)

    if dispatched_count > 0:
        LEDGER.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        log(f"Despachadas {dispatched_count} tareas (worktrees propios vía routing.json).")


if __name__ == "__main__":
    main()

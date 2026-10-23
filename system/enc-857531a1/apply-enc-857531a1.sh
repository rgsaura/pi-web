#!/usr/bin/env bash
# apply-enc-857531a1.sh — cierre de la referencia muerta de brief-profiles (prop-e0bcbbfb)
# y checker de rutas de perfiles en el --self-test del dispatcher.
# Origen: enc-857531a1 (2026-10-23). Patrón de despliegue: enc-31db1c6b/enc-356a790b
# (backup -> install -> verify). EJECUTAR EN EL HOST VM101 (runner-terminal
# 172.17.0.1:30164): el contenedor api monta ~/.local/bin y ~/.config/exohuman en ro.
# Idempotente: re-ejecutar no duplica backups ni cambia nada ya instalado.
set -uo pipefail

SRC="$HOME/workspaces/exohuman/.worktrees/wt-857531a1/system/enc-857531a1"
PROFILES="$HOME/.config/exohuman/brief-profiles.json"
DISPATCHER="$HOME/.local/bin/routines/rg-task-dispatcher.py"
LOGDIR="$HOME/.local/state/exohuman/enc-857531a1"
LOG="$LOGDIR/apply-$(date +%Y%m%d-%H%M%S).log"

step() { echo "==> $1"; }
die()  { echo "FATAL: $1" >&2; exit 1; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
FAILED=0

mkdir -p "$LOGDIR"
exec > >(tee -a "$LOG") 2>&1
echo "== enc-857531a1: code-build a fuentes vivas + self-test de rutas de perfiles =="
echo "host: $(hostname) · usuario: $(whoami) · $(date -Is)"

# 0) ¿podemos escribir? (sesiones sandbox: montajes ro -> abortar limpio)
if ! touch "$HOME/.local/bin/routines/.deploy-probe-$$" 2>/dev/null; then
    echo "SIN-ESCRITURA: ~/.local/bin es de sólo lectura en esta sesión (contenedor api)."
    echo "Ejecuta desde el host VM101 vía runner-terminal (172.17.0.1:30164, X-Runner-Token)."
    exit 3
fi
rm -f "$HOME/.local/bin/routines/.deploy-probe-$$"

[ -f "$SRC/brief-profiles.json" ] || die "falta $SRC/brief-profiles.json"
[ -f "$SRC/rg-task-dispatcher.py" ] || die "falta $SRC/rg-task-dispatcher.py"

# 1) brief-profiles.json — backup + install
step "brief-profiles.json: backup + install"
[ -f "$PROFILES.bak-pre-enc-857531a1" ] || cp -a "$PROFILES" "$PROFILES.bak-pre-enc-857531a1"
cp "$SRC/brief-profiles.json" "$PROFILES" || die "install brief-profiles.json"
cmp -s "$SRC/brief-profiles.json" "$PROFILES" && pass "brief-profiles.json instalado (idéntico al worktree)" \
    || fail "brief-profiles.json difiere del worktree"

# 2) rg-task-dispatcher.py — backup + install
step "rg-task-dispatcher.py: backup + install"
[ -f "$DISPATCHER.bak-pre-enc-857531a1" ] || cp -a "$DISPATCHER" "$DISPATCHER.bak-pre-enc-857531a1"
cp "$SRC/rg-task-dispatcher.py" "$DISPATCHER" || die "install rg-task-dispatcher.py"
chmod 775 "$DISPATCHER"
cmp -s "$SRC/rg-task-dispatcher.py" "$DISPATCHER" && pass "rg-task-dispatcher.py instalado (idéntico al worktree)" \
    || fail "rg-task-dispatcher.py difiere del worktree"

# 3) Verify — JSON, sintaxis y checker de rutas contra los perfiles INSTALADOS
step "verify: json + py_compile + check_profile_paths (perfiles instalados)"
python3 -m json.tool "$PROFILES" > /dev/null && pass "brief-profiles.json es JSON válido" \
    || fail "brief-profiles.json NO es JSON válido"
python3 -m py_compile "$DISPATCHER" && pass "rg-task-dispatcher.py compila" \
    || fail "rg-task-dispatcher.py NO compila"

python3 - "$DISPATCHER" "$PROFILES" <<'PYEOF' || FAILED=1
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("td", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
profiles = json.load(open(sys.argv[2]))
n, dead = m.check_profile_paths(profiles)
print(f"check_profile_paths: {n} referencias · muertas={dead}")
if dead:
    print("FAIL referencias muertas en perfiles instalados"); sys.exit(1)
cr = m.compose_mounted_roots()
if cr is not None:
    if cr != set(m.SANDBOX_MOUNTED_ROOTS):
        print(f"FAIL raíces desalineadas con compose: {sorted(cr)}"); sys.exit(1)
    print(f"PASS raíces del sandbox alineadas con deploy/compose.yaml ({len(cr)})")
else:
    print("NOTE compose no legible: cross-check de raíces omitido")
# el detector DEBE detectar una ruta inexistente; la regla de visibilidad,
# marcar fuera de las raíces del sandbox aunque exista en el host
_, dead_fake = m.check_profile_paths({"profiles": {"fake": {"contexto": [
    "~/.no-existe-enc-857531a1/<x>.md"]}}})
if not dead_fake or dead_fake[0][3] != "no existe":
    print(f"FAIL el detector no detecta una ruta inexistente: {dead_fake}"); sys.exit(1)
if m._under(Path("/etc"), tuple(m.SANDBOX_MOUNTED_ROOTS) + tuple(m.SANDBOX_LOCAL_ROOTS)):
    print("FAIL la regla de visibilidad no marca lo que queda fuera de las raíces"); sys.exit(1)
print("PASS detector de rutas muertas activo (inexistente + regla de visibilidad)")
PYEOF

echo
if [ "$FAILED" = 0 ]; then
    echo "APPLY OK — perfiles code-build enlazados a fuentes vivas + checker de rutas instalado"
    exit 0
fi
echo "APPLY CON FALLOS — revisar log $LOG"
exit 1

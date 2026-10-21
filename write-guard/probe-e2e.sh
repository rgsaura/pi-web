#!/usr/bin/env bash
# probe-e2e.sh — verificación real de write-guard (enc-59c26f58)
# Requiere despliegue previo (~/.pi/agent/extensions/write-guard/index.ts + config).
# Ejecuta: (A) sesión ROT real con intentos dentro/fuera, (B) control no-ROT,
# y comprueba disco + log + recibo de notificación. Salida: PASS/FAIL por caso.
set -u
PI=/usr/local/bin/pi
LOG="$HOME/.local/state/write-guard/log.jsonl"
ROT_CWD="$HOME/.local/state/routines/rot/home"
BUN=/usr/local/bin/bun
NOTIFY="$HOME/.agents/skills/personal-notifications/scripts/notify.ts"
DAY=$(date +%Y%m%d)
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ok  $2"; else FAIL=$((FAIL+1)); echo "FAIL  $2"; fi }

echo "[A] sesión ROT (PI_PROFILE=assistant, cwd puente)"
mkdir -p "$ROT_CWD"; rm -rf /tmp/wg-e2e /tmp/wg-e2e-sessions
P='PRUEBA TÉCNICA write-guard. Ejecuta EXACTAMENTE con las herramientas nativas: 1) write "dentro" en /tmp/wg-e2e/dentro.txt 2) write "fuera" en /home/rgsaura/wg-e2e-fuera.txt 3) bash: echo prueba > /home/rgsaura/wg-e2e-fuera2.txt 4) bash: rm -f /home/rgsaura/wg-e2e-victima.txt. Responde UNA línea por paso: "N) OK" o "N) BLOQUEADO". Nada más.'
OUT=$(cd "$ROT_CWD" && timeout 300 env PI_PROFILE=assistant "$PI" --session-dir /tmp/wg-e2e-sessions --session-id wg-e2e --print "$P" 2>/dev/null)
echo "$OUT" | grep -q '^1) OK' ; ck $? "A1 write /tmp permitido"
echo "$OUT" | grep -q '^2) BLOQUEADO' ; ck $? "A2 write fuera bloqueado"
echo "$OUT" | grep -q '^3) BLOQUEADO' ; ck $? "A3 bash redirect fuera bloqueado"
echo "$OUT" | grep -q '^4) BLOQUEADO' ; ck $? "A4 rm fuera bloqueado"
[ -f /tmp/wg-e2e/dentro.txt ] ; ck $? "A5 archivo dentro creado"
[ ! -f "$HOME/wg-e2e-fuera.txt" ] && [ ! -f "$HOME/wg-e2e-fuera2.txt" ] ; ck $? "A6 archivos fuera NO creados"
grep -q '"event":"block".*wg-e2e-fuera.txt' "$LOG" ; ck $? "A7 bloqueo registrado en log"

echo "[B] control no-ROT (sin PI_PROFILE)"
rm -f "$HOME/wg-e2e-ctl.txt"
(cd /tmp && timeout 200 env -u PI_PROFILE "$PI" --session-dir /tmp/wg-e2e-ctl-s --session-id wg-ctl --print 'Ejecuta: herramienta write escribe "control" en /home/rgsaura/wg-e2e-ctl.txt y responde solo OK.' >/dev/null 2>&1)
[ -f "$HOME/wg-e2e-ctl.txt" ] ; ck $? "B1 escritura fuera permitida (guarda inactiva)"
rm -f "$HOME/wg-e2e-ctl.txt"

echo "[C] notificación (recibo del broker)"
H=$(python3 -c "import hashlib;print(hashlib.sha1(b'write|/home/rgsaura/wg-e2e-fuera.txt|herramienta de escritura').hexdigest()[:12])")
ST=$(echo "{\"key\":\"write-guard:block:${H}:${DAY}\"}" | "$BUN" "$NOTIFY" status 2>/dev/null)
echo "   $ST" | head -1
echo "$ST" | grep -q '"status":"\(queued\|delivered\|included_in_digest\)"' ; ck $? "C1 recibo duradero de la notificación"

rm -rf /tmp/wg-e2e /tmp/wg-e2e-sessions /tmp/wg-e2e-ctl-s
echo
echo "RESULT: $PASS ok · $FAIL fail"
[ "$FAIL" = "0" ]

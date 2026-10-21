#!/usr/bin/env bash
# deploy/runner/install.sh — bootstrap del system piece "pi-web-runner" (enc-29d7943d)
# Piezas creadas (por RUTA ABSOLUTA, hogares canónicos):
#   ~/.config/exohuman/pi-web-runner/env      config + token (600)
#   ~/.config/systemd/user/pi-web-runner.service (+ drop-in memoria)
#   ~/workspaces/exohuman/runner/             releases (los llena deploy.sh runner)
# Idempotente: no regenera el token si ya existe; arranca el servicio si hay release.
set -euo pipefail

ENV_DIR="$HOME/.config/exohuman/pi-web-runner"
ENV_FILE="$ENV_DIR/env"
UNIT_SRC="$(cd "$(dirname "$0")" && pwd)/pi-web-runner.service"
UNIT_DST="$HOME/.config/systemd/user/pi-web-runner.service"
DROPIN_DIR="$HOME/.config/systemd/user/pi-web-runner.service.d"
RUNNER_HOME="$HOME/workspaces/exohuman/runner"
STATE_DIR="$HOME/.local/state/exohuman/pi-web-runner"
PORT="${RUNNER_PORT:-30164}"

mkdir -p "$ENV_DIR" "$DROPIN_DIR" "$RUNNER_HOME/releases" "$STATE_DIR" "$(dirname "$UNIT_DST")"

if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<ENV
# ~/.config/exohuman/pi-web-runner/env — config del runner host (enc-29d7943d)
# Puerto FUERA del rango dev 30145-30160 (registro rg-port): es un servicio de
# sistema, no un dev server. Origen: prop-60ea3410=B.
PORT=$PORT
# 172.17.0.1 = gateway del bridge Docker: alcanzable por el contenedor api
# (host.docker.internal) y por el propio host; inalcanzable desde fuera de la VM.
HOSTNAME=172.17.0.1
PI_WEB_ROLE=runner
PI_WEB_RUNNER_TOKEN=$TOKEN
# Hosts con nombre (no-IP) que el runner acepta; los IP literals y localhost
# siempre pasan. Mantener alineado con exohuman-ui.service.
PI_WEB_ALLOWED_HOSTS=exohuman,exohuman.tail08ecb.ts.net,rg-exohuman,rg-exohuman.tail08ecb.ts.net,exohuman.rgsaura.com,localhost
HOME=$HOME
PATH=$HOME/.local/bin:$HOME/.pi/agent/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV
  chmod 600 "$ENV_FILE"
  echo "» token generado en $ENV_FILE"
else
  echo "» env existente (token conservado)"
fi

cp "$UNIT_SRC" "$UNIT_DST"
cat > "$DROPIN_DIR/resources.conf" <<'CONF'
# Límites de memoria alineados con exohuman-ui.service (producción).
[Service]
MemoryHigh=800M
MemoryMax=1000M
CONF

systemctl --user daemon-reload
systemctl --user enable pi-web-runner.service >/dev/null
if [[ -x "$RUNNER_HOME/current/pi-node" ]]; then
  systemctl --user restart pi-web-runner.service
  sleep 1
  systemctl --user is-active --quiet pi-web-runner.service && echo "» runner ACTIVO" || { journalctl --user -u pi-web-runner -n 20 --no-pager; exit 1; }
else
  echo "» unit instalada y enabled (arrancará con el primer release: deploy/deploy.sh runner)"
fi

# Recibo del cambio (contrato system-creation)
cat > "$STATE_DIR/install.json" <<EOF
{
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "encargo": "enc-29d7943d",
  "port": $PORT,
  "unit": "$UNIT_DST",
  "env": "$ENV_FILE",
  "home": "$RUNNER_HOME",
  "decision": "prop-60ea3410=B"
}
EOF
echo "» recibo: $STATE_DIR/install.json"

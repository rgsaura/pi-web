#!/usr/bin/env bash
# deploy/deploy.sh — ciclo de vida del stack UI/API split (enc-29d7943d)
#
# Arquitectura: front(caddy) + web(UI-only) + api(app completa: SDK, PTY, git,
# runner process) — TODO en Docker, cero piezas de app en el host.
#
# Uso (desde un checkout del repo):
#   deploy/deploy.sh all                     # build local + up + self-test (QA)
#   deploy/deploy.sh all --tag sha-X         # desde imagen GHCR promovida
#   deploy/deploy.sh up|down|status|logs
#   deploy/deploy.sh rollback <tag>
#   deploy/deploy.sh self-test
#
# Entornos (ENV=qa|pre|prod):
#   qa   → :30152 (por defecto; registro rg-port para worktrees)
#   pre  → :30149 (paramenta el legacy pre; primera vez: cutover automático)
#   prod → :30141 (paramenta exohuman-ui.service; cutover requiere --cutover)
#
# Entorno (overrides): WEB_PORT · GHCR (ghcr.io/agegr/pi-web) · DOCKER
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"
GHCR="${GHCR:-ghcr.io/agegr/pi-web}"
DOCKER="${DOCKER:-sudo docker}"
ENV="${ENV:-qa}"

case "$ENV" in
  qa)   WEB_PORT="${WEB_PORT:-30152}"; API_PORT="${API_PORT:-3300}" ;;
  pre)  WEB_PORT="${WEB_PORT:-30149}"; API_PORT="${API_PORT:-3301}" ;;
  prod) WEB_PORT="${WEB_PORT:-30141}"; API_PORT="${API_PORT:-3302}" ;;
  *) die "ENV inválido: $ENV (qa|pre|prod)" ;;
esac

LEGACY_UNIT=""; [[ "$ENV" == "pre" ]] && LEGACY_UNIT="exohuman-ui-pre.service"
[[ "$ENV" == "prod" ]] && LEGACY_UNIT="exohuman-ui.service"

TAG="local"
CUTOVER=0
LOG() { printf '» [%s] %s\n' "$ENV" "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

env_file() { echo "$DEPLOY_DIR/.env.$ENV"; }

internal_token() {
  local f="$DEPLOY_DIR/.token"
  if [[ ! -f "$f" ]]; then
    umask 177; openssl rand -hex 32 > "$f"
  fi
  cat "$f"
}

stop_legacy_if_needed() {
  [[ -z "$LEGACY_UNIT" ]] && return 0
  if systemctl --user is-active --quiet "$LEGACY_UNIT" 2>/dev/null; then
    [[ "$CUTOVER" == "1" ]] || die "$LEGACY_UNIT sigue activo en :$WEB_PORT. Cutover aprobado → añade --cutover (para y deshabilita el legacy)."
    LOG "cutover: parando $LEGACY_UNIT (queda deshabilitado; rollback = enable --now)"
    systemctl --user disable --now "$LEGACY_UNIT"
    sleep 1
  fi
}

cmd_images() {
  if [[ "$TAG" == "local" ]]; then
    LOG "build local exohuman-app:local (network host + proxy 127.0.0.1:1056)"
    ( cd "$DEPLOY_DIR" && $DOCKER compose build --pull=false api )
  else
    LOG "pull $GHCR:$TAG"
    if $DOCKER pull "$GHCR:$TAG" 2>/dev/null; then
      $DOCKER tag "$GHCR:$TAG" "exohuman-app:$TAG"
    elif $DOCKER image inspect "exohuman-app:$TAG" >/dev/null 2>&1; then
      LOG "imagen local exohuman-app:$TAG (promoción sin GHCR)"
    else
      die "ni $GHCR:$TAG ni exohuman-app:$TAG existen"
    fi
  fi
}

write_compose_env() {
  local f; f="$(env_file)"
  cat > "$f" <<ENV
APP_IMAGE=exohuman-app:$TAG
WEB_PORT=$WEB_PORT
API_PORT=$API_PORT
INTERNAL_TOKEN=$(internal_token)
# el token se exige en up: si .env no lo trae, aborta (no un stack sin auth)
PI_WEB_ALLOWED_HOSTS=${PI_WEB_ALLOWED_HOSTS:-exohuman,exohuman.tail08ecb.ts.net,rg-exohuman,rg-exohuman.tail08ecb.ts.net,exohuman.rgsaura.com,exohuman-pre.rgsaura.com,localhost}
PI_WEB_PASSWORD=${PI_WEB_PASSWORD:-}
ENV
  chmod 600 "$f"
  # symlink del entorno activo (compose lee .env del project dir)
  ln -sfn "$(basename "$f")" "$DEPLOY_DIR/.env"
}

compose() { ( cd "$DEPLOY_DIR" && $DOCKER compose -p "exohuman-$ENV" "$@" ); }

cmd_up() {
  write_compose_env
  if ss -tln "sport = :$WEB_PORT" | grep -q LISTEN; then
    local own; own="$(compose ps -q front 2>/dev/null || true)"
    if [[ -n "$own" ]] && $DOCKER ps --format '{{.ID}}' | grep -q "^${own:0:12}"; then
      LOG "actualizando el stack propio en :$WEB_PORT"
    elif [[ -n "$LEGACY_UNIT" ]] && systemctl --user is-active --quiet "$LEGACY_UNIT" 2>/dev/null; then
      stop_legacy_if_needed
    else
      die ":$WEB_PORT tiene un listener ajeno. Investiga (ss -tlnp 'sport = :$WEB_PORT')."
    fi
  fi
  compose up -d
  LOG "stack exohuman-$ENV en :$WEB_PORT (imagen $TAG)"
}

cmd_down() { compose down; }

cmd_status() {
  echo "── stack exohuman-$ENV ──"
  compose ps 2>/dev/null || echo "(down)"
  [[ -n "$LEGACY_UNIT" ]] && { echo "── legacy: $LEGACY_UNIT ──"; systemctl --user is-active "$LEGACY_UNIT" 2>/dev/null || echo "(parado)"; }
  echo "── probes ──"
  self_test_probes || true
}

cmd_logs() { compose logs -f --tail=50 "$@"; }

probe() { # probe NAME URL EXPECT [curl args...]
  local name="$1" url="$2" expect="$3"; shift 3
  local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$url" || echo 000)"
  if [[ "$code" == "$expect" ]]; then printf '  ✓ %s (%s)\n' "$name" "$code";
  else printf '  ✗ %s: esperaba %s, got %s\n' "$name" "$expect" "$code"; FAIL=1; fi
}
FAIL=0

self_test_probes() {
  # loopback→docker-proxy hairpin no responde en VM101: la base es la IP LAN
  local base="http://${QA_BIND_IP:-$(hostname -I | awk '{print $1}')}:$WEB_PORT"
  # caddy arranca en ~1-3 s y el api (Next) puede tardar más tras recreate:
  # el gate espera a que ambos respondan (cualquier código HTTP = vivo)
  local i
  for i in $(seq 1 20); do
    curl -s -o /dev/null -m3 "http://127.0.0.1:${API_PORT:-3300}/api/health" && break
    sleep 1
  done
  for i in $(seq 1 10); do
    curl -s -o /dev/null -m3 "$base/" && break
    sleep 1
  done
  probe "UI (html)"                 "$base/" 200
  probe "API sessions (caddy→api)"  "$base/api/sessions" 200
  # api corre con network_mode: host → 127.0.0.1:$API_PORT directo (sin token → 401)
  probe "API sin token directo (host :${API_PORT:-3300})" "http://127.0.0.1:${API_PORT:-3300}/api/sessions" 401
  probe "web 404 en /api (role)"           "http://$(docker_ip web):3000/api/sessions" 404 2>/dev/null || true
  return $FAIL
}

docker_ip() { $DOCKER inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "exohuman-${ENV}-$1-1" 2>/dev/null; }

cmd_self_test() {
  LOG "probes del despliegue"
  self_test_probes || die "algún probe falló"
  LOG "SELF-TEST OK"
}

cmd_all() {
  cmd_images
  cmd_up
  cmd_self_test
}

main() {
  local cmd="${1:-all}"; shift || true
  local positional=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) TAG="$2"; shift 2 ;;
      --cutover) CUTOVER=1; shift ;;
      -*) die "flag desconocido: $1" ;;
      *) positional+=("$1"); shift ;;
    esac
  done
  case "$cmd" in
    all) cmd_all ;;
    images) cmd_images ;;
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    logs) cmd_logs "${positional[@]+${positional[@]}}" ;;
    self-test) cmd_self_test ;;
    rollback)
      [[ ${#positional[@]} -ge 1 ]] || die "uso: deploy.sh rollback <tag-anterior>"
      TAG="${positional[0]}"
      LOG "ROLLBACK a $TAG"
      cmd_images; cmd_up; cmd_self_test
      ;;
    *) die "comando desconocido: $cmd (all|images|up|down|status|logs|self-test|rollback)" ;;
  esac
}

main "$@"

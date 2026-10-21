#!/usr/bin/env bash
# deploy/deploy.sh — ciclo de vida del stack UI/API split (enc-29d7943d, prop-60ea3410=B)
#
# Arquitectura: front(caddy) + web(UI) + api(stateless proxy) en Docker, y el
# RUNNER en el host (systemd pi-web-runner.service) consumido vía RUNNER_URL.
# La MISMA imagen web alimenta el runner (docker create + docker cp): lo que
# QA validó es lo que corre.
#
# Uso (desde un checkout del repo):
#   deploy/deploy.sh all              # images + runner + stack (QA local)
#   deploy/deploy.sh all --tag sha-X  # todo desde imágenes GHCR promovidas
#   deploy/deploy.sh runner [--tag T] # sólo refrescar el runner del host
#   deploy/deploy.sh up|down|status|logs
#   deploy/deploy.sh rollback <tag>   # tag anterior = rollback completo
#   deploy/deploy.sh self-test        # probes reales del stack y el runner
#
# Entorno (overrides): WEB_PORT (30152) · GHCR (ghcr.io/agegr/pi-web) ·
#   RUNNER_ENV (~/.config/exohuman/pi-web-runner/env) · DOCKER (sudo docker)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"
WEB_PORT="${WEB_PORT:-30152}"
GHCR="${GHCR:-ghcr.io/agegr/pi-web}"
RUNNER_ENV="${RUNNER_ENV:-$HOME/.config/exohuman/pi-web-runner/env}"
RUNNER_HOME="${RUNNER_HOME:-$HOME/workspaces/exohuman/runner}"
RUNNER_UNIT="pi-web-runner.service"
DOCKER="${DOCKER:-sudo docker}"
PROTECTED_PORTS="30141 30149"   # prod/pre systemd hasta cutover aprobado

TAG="local"
log() { printf '» %s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

runner_env_value() { # runner_env_value KEY < file
  sed -n "s/^$1=//p" "$RUNNER_ENV" | tail -1
}

require_runner_env() {
  [[ -f "$RUNNER_ENV" ]] || die "falta $RUNNER_ENV — corre deploy/runner/install.sh primero"
  [[ -n "$(runner_env_value PI_WEB_RUNNER_TOKEN)" ]] || die "PI_WEB_RUNNER_TOKEN vacío en $RUNNER_ENV"
}

image_names() { # sets WEB_IMG / API_IMG (names always local; GHCR is pull-only)
  WEB_IMG="exohuman-web:$TAG"; API_IMG="exohuman-api:$TAG"
}

cmd_images() {
  image_names
  if [[ "$TAG" == "local" ]]; then
    log "build local: $WEB_IMG (contexto repo, --network host para el proxy 127.0.0.1:1056)"
    $DOCKER build --network host \
      --build-arg HTTP_PROXY="${HTTP_PROXY:-http://127.0.0.1:1056}" \
      --build-arg HTTPS_PROXY="${HTTPS_PROXY:-http://127.0.0.1:1056}" \
      --build-arg NO_PROXY="localhost,127.0.0.1" \
      -f "$REPO_ROOT/Dockerfile" -t "$WEB_IMG" "$REPO_ROOT"
    log "build local: $API_IMG"
    ( cd "$DEPLOY_DIR/api-proxy" && $DOCKER build -t "$API_IMG" . )
  else
    log "pull $GHCR:{web,api}-$TAG (fallback: imagen local exohuman-{web,api}:$TAG)"
    local role ok=1
    for role in web api; do
      if $DOCKER pull "$GHCR:$role-$TAG" 2>/dev/null; then
        $DOCKER tag "$GHCR:$role-$TAG" "exohuman-$role:$TAG"
      elif $DOCKER image inspect "exohuman-$role:$TAG" >/dev/null 2>&1; then
        log "  $role: usando imagen local exohuman-$role:$TAG"
      else
        die "ni $GHCR:$role-$TAG (pull) ni exohuman-$role:$TAG (local) existen"
        ok=0
      fi
    done
    [[ $ok -eq 1 ]] || exit 1
  fi
}

cmd_runner() {
  require_runner_env
  image_names
  mkdir -p "$RUNNER_HOME/releases"
  local release="$RUNNER_HOME/releases/$TAG"
  local tmp
  tmp="$(mktemp -d "$RUNNER_HOME/.release-$TAG.XXXXXX")"
  log "extrayendo /app de $WEB_IMG → release $TAG"
  local cid
  cid="$($DOCKER create "$WEB_IMG")"
  $DOCKER cp "$cid:/app/." "$tmp/" >/dev/null
  $DOCKER cp "$cid:/usr/local/bin/node" "$tmp/pi-node" >/dev/null
  $DOCKER rm "$cid" >/dev/null
  # docker cp preserva el uid del contenedor (root para binarios del sistema):
  # normaliza ownership antes de mover el release a su hogar definitivo.
  sudo -n chown -R "$(id -u):$(id -g)" "$tmp"
  chmod +x "$tmp/pi-node"
  [[ -f "$tmp/server.js" ]] || { rm -rf "$tmp"; die "la imagen no contiene server.js standalone"; }
  rm -rf "$release"
  mv "$tmp" "$release"
  # current siempre apunta al release activo; el switch es atómico
  ln -sfn "releases/$TAG" "$RUNNER_HOME/current"
  # poda: conserva los 3 releases más recientes; el activo jamás se borra
  local active
  active="$(readlink "$RUNNER_HOME/current")"
  ( cd "$RUNNER_HOME/releases" && ls -1dt ./* 2>/dev/null | tail -n +4 | while read -r old; do
      [[ "releases/$old" == "$active" ]] || rm -rf "$old"
    done )
  log "reinicio $RUNNER_UNIT"
  systemctl --user restart "$RUNNER_UNIT"
  sleep 1
  systemctl --user is-active --quiet "$RUNNER_UNIT" || { journalctl --user -u "$RUNNER_UNIT" -n 20 --no-pager; die "runner no activo"; }
  log "runner activo en release $TAG"
}

write_compose_env() {
  require_runner_env
  image_names
  local port token allowed password runner_port
  runner_port="$(runner_env_value PORT)"
  token="$(runner_env_value PI_WEB_RUNNER_TOKEN)"
  allowed="$(runner_env_value PI_WEB_ALLOWED_HOSTS)"
  password="$(runner_env_value PI_WEB_PASSWORD)"
  for p in $PROTECTED_PORTS; do
    [[ "$WEB_PORT" == "$p" ]] && [[ "${FORCE_CUTOVER:-}" != "1" ]] && \
      die ":$p es prod/pre systemd (intocable hasta cutover). Usa FORCE_CUTOVER=1 tras aprobación."
  done
  if ss -tln "sport = :$WEB_PORT" | grep -q LISTEN && [[ "${FORCE_PORT:-}" != "1" ]]; then
    # El listener puede ser este mismo stack (update normal) u otro proceso (riesgo)
    local own
    own="$( ( cd "$DEPLOY_DIR" && $DOCKER compose ps -q front ) 2>/dev/null )"
    if [[ -n "$own" ]] && $DOCKER ps --format '{{.ID}}' | grep -q "^${own:0:12}"; then
      log "actualizando el stack propio en :$WEB_PORT"
    else
      die ":$WEB_PORT ya tiene listener ajeno (¿servicio legacy?). FORCE_PORT=1 para saltar el guard."
    fi
  fi
  cat > "$DEPLOY_DIR/.env" <<ENV
WEB_IMAGE=$WEB_IMG
API_IMAGE=$API_IMG
WEB_PORT=$WEB_PORT
RUNNER_URL=http://host.docker.internal:${runner_port:-30164}
RUNNER_TOKEN=$token
PI_WEB_ALLOWED_HOSTS=$allowed
PI_WEB_PASSWORD=${password:-}
ENV
  chmod 600 "$DEPLOY_DIR/.env"
}

cmd_up() {
  write_compose_env
  ( cd "$DEPLOY_DIR" && $DOCKER compose up -d )
  log "stack en :$WEB_PORT"
  $DOCKER compose -f "$DEPLOY_DIR/compose.yaml" --project-directory "$DEPLOY_DIR" ps
}

cmd_down() {
  ( cd "$DEPLOY_DIR" && $DOCKER compose down )
}

cmd_status() {
  echo "── runner ($RUNNER_UNIT) ──"
  systemctl --user is-active "$RUNNER_UNIT" || true
  readlink "$RUNNER_HOME/current" 2>/dev/null || echo "(sin release)"
  echo "── stack docker ──"
  ( cd "$DEPLOY_DIR" && $DOCKER compose ps ) 2>/dev/null || echo "(stack down)"
  echo "── probes ──"
  self_test_probes
}

cmd_logs() {
  ( cd "$DEPLOY_DIR" && $DOCKER compose logs -f --tail=50 "$@" )
}

self_test_probes() {
  local token runner_port fail=0
  token="$(runner_env_value PI_WEB_RUNNER_TOKEN 2>/dev/null || true)"
  runner_port="$(runner_env_value PORT 2>/dev/null || echo 30164)"
  probe() { # probe NAME URL EXPECT [curl args...]
    local name="$1" url="$2" expect="$3"; shift 3
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$@" "$url" || echo 000)"
    if [[ "$code" == "$expect" ]]; then printf '  ✓ %s (%s)\n' "$name" "$code";
    else printf '  ✗ %s: esperaba %s, got %s\n' "$name" "$expect" "$code"; fail=1; fi
  }
  if [[ -n "$token" ]]; then
    probe "runner /api/sessions con token" "http://172.17.0.1:${runner_port}/api/sessions" 200 -H "x-runner-token: $token"
    probe "runner sin token → 401" "http://172.17.0.1:${runner_port}/api/sessions" 401
    probe "runner UI → 404 (headless)" "http://172.17.0.1:${runner_port}/" 404 -H "x-runner-token: $token"
  fi
  probe "stack :$WEB_PORT UI (html)" "http://127.0.0.1:$WEB_PORT/" 200
  probe "stack :$WEB_PORT /api/sessions (caddy→api→runner)" "http://127.0.0.1:$WEB_PORT/api/sessions" 200
  return $fail
}

cmd_self_test() {
  log "api-proxy self-test"
  node "$DEPLOY_DIR/api-proxy/server.mjs" --self-test
  log "probes del despliegue"
  self_test_probes || die "algun probe falló"
  log "SELF-TEST OK"
}

cmd_all() {
  cmd_images
  cmd_runner
  cmd_up
  cmd_self_test
}

main() {
  local cmd="${1:-all}"; shift || true
  local positional=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) TAG="$2"; shift 2 ;;
      -*) die "flag desconocido: $1" ;;
      *) positional+=("$1"); shift ;;
    esac
  done
  case "$cmd" in
    all) cmd_all ;;
    images) cmd_images ;;
    runner) cmd_runner ;;
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    logs) cmd_logs "${positional[@]+${positional[@]}}" ;;
    self-test) cmd_self_test ;;
    rollback)
      [[ ${#positional[@]} -ge 1 ]] || die "uso: deploy.sh rollback <tag-anterior>"
      TAG="${positional[0]}"
      log "ROLLBACK a $TAG"
      cmd_images
      cmd_runner
      cmd_up
      cmd_self_test
      ;;
    *) die "comando desconocido: $cmd (all|images|runner|up|down|status|logs|self-test|rollback)" ;;
  esac
}

main "$@"

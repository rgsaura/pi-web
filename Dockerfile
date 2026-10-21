# ExoHuman app image (enc-29d7943d) — one image, two roles:
#
#   PI_WEB_ROLE=web → UI-only container (caddy routes /api/* to the api service)
#   PI_WEB_ROLE=api → headless API + agent runner: full app with the pi SDK
#                     embedded, PTY, git; detached sessions run in process mode
#                     (lib/detached-runner.ts, EXO_RUNNER_MODE=process).
#
# Same artifact everywhere: what QA validated is what runs in prod.
#
# VM101 constraints (see wiki/arquitectura.md §red): egress is proxy-only and
# container DNS is blocked → builds use --network host + proxy build-args, and
# there is NO apt anywhere (node:22-bookworm ships git, python3, g++).

FROM node:22-bookworm AS builder
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY=localhost,127.0.0.1
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# postinstall (bin/prepare-terminal.js) runs during npm ci — bin/ must exist
COPY package.json package-lock.json ./
COPY bin ./bin
RUN npm ci --no-audit --no-fund
COPY . .
# next.config.ts turns on `output: standalone` unless PI_WEB_BUILD_STANDALONE=0
RUN npm run build

FROM node:22-bookworm AS pi-cli
# Standalone pi CLI + its production deps for the process runner (detached
# sessions). Next's standalone tracing does not carry the CLI bundle, and the
# scoped packages alone miss external deps (jiti…) — so a clean prod install.
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY=localhost,127.0.0.1
WORKDIR /pi
COPY package.json package-lock.json ./
RUN node -e "const p=require('./package.json');const d=p.dependencies['@earendil-works/pi-coding-agent'];process.stdout.write(d||'latest')" > /tmp/ver \
  && npm install --omit=dev --no-audit --no-fund "@earendil-works/pi-coding-agent@$(cat /tmp/ver)"

FROM node:22-bookworm AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/rgsaura
# The image's uid-1000 user is `node`; rename to rgsaura (same uid → bind
# mounts owned by host uid 1000 stay readable/writable, identical HOME paths).
RUN usermod -l rgsaura -d /home/rgsaura -m node \
  && groupmod -n rgsaura node
# `pi` CLI for detached runs (process runner): clean prod install with deps
COPY --from=pi-cli /pi/node_modules /opt/pi-runtime/node_modules
RUN ln -s /opt/pi-runtime/node_modules/@earendil-works/pi-coding-agent/$(node -e "const p=require('/opt/pi-runtime/node_modules/@earendil-works/pi-coding-agent/package.json');console.log(p.bin&&p.bin.pi?p.bin.pi:'dist/bundle/cli.js')") /usr/local/bin/pi
# node-pty prebuilds are not always carried by standalone tracing
COPY --from=builder /app/node_modules/node-pty/prebuilds /tmp/node-pty-prebuilds
COPY --from=builder /app/.next/standalone ./
RUN mkdir -p node_modules/node-pty \
  && if [ -d node_modules/node-pty ] && [ ! -d node_modules/node-pty/prebuilds ]; then \
       cp -r /tmp/node-pty-prebuilds node_modules/node-pty/prebuilds; \
     fi \
  && rm -rf /tmp/node-pty-prebuilds
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER rgsaura
EXPOSE 3000
# Compose sets init: true (docker's tini) for signal/reap handling
CMD ["node", "server.js"]

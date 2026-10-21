# ExoHuman app image (enc-29d7943d, prop-60ea3410=B) — one full build, two deployments:
#
#   PI_WEB_ROLE=web     → UI-only container of the split stack (caddy routes /api/*
#                         to the stateless API service; this role 404s /api/*).
#   PI_WEB_ROLE=runner  → host runner (systemd pi-web-runner.service): the headless
#                         API broker — spawn de sesiones pi, streaming SSE, PTY, git —
#                         extracted from this same image by deploy/deploy.sh runner.
#                         Same artifact everywhere: what QA saw is what runs.
#
# Build (VM101 egress is a loopback-only proxy, so builds run with --network host):
#   docker build --network host --build-arg HTTP_PROXY=http://127.0.0.1:1056 \
#                --build-arg HTTPS_PROXY=http://127.0.0.1:1056 -t exohuman-web:local .
#
# No apt anywhere: node-pty ships linux prebuilds, git/PTY live in the host runner.

FROM node:22-bookworm-slim AS builder
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY=localhost,127.0.0.1
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY bin ./bin
RUN npm ci
COPY . .
# next.config.ts turns on `output: standalone` unless PI_WEB_BUILD_STANDALONE=0
RUN npm run build

FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/node
# node-pty loads its prebuild at runtime; standalone tracing does not always
# carry the .node files along, so make sure they are present.
COPY --from=builder /app/node_modules/node-pty/prebuilds /tmp/node-pty-prebuilds
COPY --from=builder /app/.next/standalone ./
RUN mkdir -p node_modules/node-pty \
    && if [ -d node_modules/node-pty ] && [ ! -d node_modules/node-pty/prebuilds ]; then \
         cp -r /tmp/node-pty-prebuilds node_modules/node-pty/prebuilds; \
       fi \
    && rm -rf /tmp/node-pty-prebuilds
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

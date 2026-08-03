# ---------- Stage 1: build the OpenBrain Desktop SPA ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- Stage 2: runtime image (serves the app + executes brains) ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DIST_DIR=/app/dist \
    WORKSPACE_DIR=/workspace \
    REGISTRY_DIR=/workspace/.registry \
    PLUGINS_DIR=/app/plugins

# Runtime server (also serves the built SPA) + shared graph executor.
COPY runtime/package.json ./package.json
COPY runtime/server.js ./server.js
COPY cloud-executor/brain-core.js ./brain-core.js

# SDK, CLI, plugin host.
COPY sdk ./sdk
COPY cli ./cli
COPY plugins ./plugins

# Built SPA from stage 1.
COPY --from=build /app/dist ./dist

# Local-first data lives on the mounted workspace volume.
RUN mkdir -p /workspace/.registry && chmod -R a+w /workspace

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ---------- openbrain-tui: run a .brain file as an interactive terminal agent ----------
# Standalone image. The brain-core executor (cloud-executor/brain-core.js) is
# vendored into the image at /app/brain-core.js so an in-process backend always
# works without a Runtime server — only LLM/tool keys are needed at runtime.
#
#   docker build -t openbrain-tui -f tui/Dockerfile .
#   docker run -it --rm \
#     -v ./research.brain:/brain.brain \
#     -e FIREWORKS_API_KEY=... \
#     openbrain-tui /brain.brain
#
# Headless (scripting/cron):
#   docker run --rm -v ./research.brain:/brain.brain -e FIREWORKS_API_KEY=... \
#     openbrain-tui /brain.brain --once "Summarize Tesla's marketing strategy"

# ---------- Stage 1: bundle the TUI ----------
FROM node:22-alpine AS build
WORKDIR /build
COPY tui/package.json tui/package-lock.json* ./
RUN npm ci --no-audit --no-fund --include=dev
COPY tui/src ./src
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# TUI runtime deps (ink, react, ...). The bundle is ESM and keeps them external.
COPY tui/package.json ./package.json
COPY tui/package-lock.json* ./
RUN npm ci --no-audit --no-fund --omit=dev

# Bundled TUI + the shared graph executor (kept .cjs so the ESM package.json
# does not misdetect it) at the paths the runner resolves. mcp-client.cjs is the
# native MCP client; mcp.json is copied so tool nodes work out of the box.
COPY --from=build /build/dist ./dist
COPY cloud-executor/brain-core.js ./brain-core.cjs
COPY cloud-executor/mcp-client.js ./mcp-client.cjs
COPY mcp.json ./mcp.json

# Binary + docs metadata.
COPY tui/README.md ./README.md

ENTRYPOINT ["node", "/app/dist/cli.js"]

# OpenBrain — the local-first AI development platform

Design AI "brains" as visual graphs, or just describe one in a sentence and the
AI Architect builds it. Brains execute with real tool nodes (GitHub, Hacker
News, web fetch), memory across runs, LLM synthesis, reports and a built-in
chat. Self-host it, and everything runs on **your** machine — your data, your
models, your keys.

## Quick start (self-hosted)

```bash
cp .env.example .env    # optional keys; local features need none
docker compose up -d    # OpenBrain Desktop + Runtime + Ollama
# open http://localhost:8080
```

Already have a native Ollama running on the host? Point the runtime at it instead of pulling a second one:

```bash
# in .env:  OLLAMA_PORT=11435  (avoid the port clash)
docker compose up -d runtime --build
OLLAMA_URL=http://host.docker.internal:11434 docker compose up -d runtime
```

Optional services:

```bash
docker compose --profile infra up -d    # + PostgreSQL, Redis, Qdrant
docker compose --profile mcp up -d      # + MCP Gateway
docker compose --profile supabase up -d # + Supabase DB
```

## Local development

```bash
npm install
npm run dev        # Vite dev server (browser execution, cloud fallback)
npm run build      # typecheck + production build
```

Run the Runtime + CLI locally without Docker:

```bash
node runtime/server.js      # serves ./dist + local APIs on :8080
node cli/brain.js doctor
node cli/brain.js init && node cli/brain.js run my-brain.brain --message "hello"
```

## The platform

- **Desktop** (`src/`) — visual canvas, AI Architect, chat, reports.
- **Runtime** (`runtime/`) — local engine: `/run`, `/composio`, `/fetch`,
  `/local/files`, `/local/finetune`, `/registry`, `/plugins`, `/system`.
- **CLI** (`cli/`) — `brain init / open / run / export / validate / doctor /
  plugins / logs`.
- **SDK** (`sdk/`) — `.brain` files + plugin API for developers.
- **`.brain` files** — first-class project files (import/export in the app).
- **Plugins** (`plugins/`) — custom nodes, providers, MCP connectors.

See `ARCHITECTURE.md` and `ROADMAP.md` for the full picture.

## Node types

`llm` · `local` (in-browser, no key) · `memory` · `planner` · `browser` ·
`github` · `mcp` · `filesystem` · `python` · `rag` · `finetune` · `news` ·
`imagegen` · `output` · `agent` · `subbrain` · `trigger` · `gate` · `tool`

## Keys (all optional)

| Key | Purpose |
| --- | --- |
| `FIREWORKS_API_KEY` | LLM nodes + AI Architect (cloud models) |
| `OLLAMA_URL` | Local models (no key) |
| `COMPOSIO_API_KEY` + `COMPOSIO_ACCOUNT_ID` + `COMPOSIO_ENTITY_ID` | GitHub / MCP tool nodes |

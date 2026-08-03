# OpenBrain Platform Architecture

OpenBrain is a local-first AI development platform. Users own their data, their
models, their API keys and their runtime — OpenBrain is only the platform that
lets them visually build, execute, debug, train and deploy AI Brains. No
OpenBrain-managed cloud is required.

## Modules

| Module | Path | Responsibility |
| --- | --- | --- |
| **OpenBrain Desktop** | `src/` (root Vite app) | The visual application: canvas, AI Architect, node palette, chat, reports, settings |
| **OpenBrain Runtime** | `runtime/` | Executes Brains, serves the Desktop SPA, manages execution + scheduling, exposes local APIs (`/run`, `/composio`, `/fetch`, `/local/files`, `/local/finetune`, `/registry`, `/plugins`, `/system`) |
| **OpenBrain CLI** | `cli/` | `brain init / open / run / export / validate / doctor / plugins / logs` |
| **OpenBrain SDK** | `sdk/` | Public API for plugin authors: `.brain` files, plugin manifests + loader, Runtime client |
| **OpenBrain Registry** | `workspace/.registry/` | Local library of `.brain` files (templates, saved brains, plugins) |
| **OpenBrain Marketplace** | — | Future online package repository (brains, templates, plugins) |
| **MCP Gateway** | `mcp-gateway/` | Hosts local MCP servers for the `mcp` node type |
| **Cloud executor** | `cloud-executor/` | Legacy hosted executor (Render) — the Runtime reuses the same `brain-core.js` |

The graph-execution core (`cloud-executor/brain-core.js`, mirrored by the
in-browser `src/core/execution/*`) is **shared** so a brain runs identically in
the browser, in Docker, or in the cloud.

## Local-first

- **Ollama** for local models (no API key), **Fireworks** optional for cloud LLM.
- `/local/files` gives tool nodes safe, scoped access to the mounted
  `WORKSPACE` (path-escaping enforced) — no remote server sees user files.
- `/local/finetune` stages fine-tune jobs into the workspace.
- `.brain` files are checked into git like source code.

## AI Providers

Provider selection is dynamic. `src/core/providers/` defines the
`AIProvider` interface; `src/core/architect/PromptBuilder.ts` lists the
catalog (Fireworks, Ollama today; OpenAI, Anthropic, Gemini, Groq, Hugging
Face planned). The Runtime reads `OLLAMA_URL`/`FIREWORKS_API_KEY` at run time
and switches providers per brain.

## Plugin system

A plugin is a directory with an `openbrain-plugin.json` manifest:

```json
{
  "name": "openbrain-weather-node",
  "version": "0.1.0",
  "kind": "node",
  "main": "index.js",
  "nodeTypes": [{ "type": "weather", "label": "Weather", "description": "..." }]
}
```

- **Desktop** (`src/core/plugins/pluginSystem.ts`) consumes manifests and
  merges `node` plugin types into the palette; it never imports plugin code
  directly (isolation).
- **Runtime** (`GET /plugins`) and **SDK** (`listPlugins`) discover and
  validate plugins from the `plugins/` directory.

## Brain file format (`.brain`)

Versioned JSON carrying graph, provider, memory, knowledge, execution
configuration and metadata:

```json
{
  "format": "openbrain/brain",
  "version": 1,
  "id": "uuid",
  "name": "My Brain",
  "provider": { "providerId": "fireworks", "model": "" },
  "memory": { "enabled": false, "kind": "working", "scope": "brain" },
  "knowledge": { "required": false, "sourceTypes": [] },
  "execution": { "mode": "auto" },
  "graph": { "nodes": [], "connections": [] },
  "dependencies": [],
  "metadata": {}
}
```

Implemented in `src/core/brain/brainFile.ts` (Desktop) and `sdk/index.js`
(CLI/Runtime). Legacy `brain.json` exports are auto-upgraded on open.

## Repository layout

```
OpenBrain/
  src/                 Desktop application (Vite + React)
  cloud-executor/      shared graph executor + hosted server
  runtime/             self-hosted engine
  cli/                 brain CLI
  sdk/                 SDK for plugin authors
  plugins/             installed plugins (example: weather node)
  mcp-gateway/         local MCP servers
  workspace/           user's local data (gitignored)
  registry/            local .brain library
  Dockerfile           single-image build (Desktop + Runtime)
  docker-compose.yml   full self-hosted stack
```

# openbrain-tui

Run a `.brain` file as an **interactive terminal agent**. Load the brain, chat
with it, and it executes its entire graph — LLM nodes, tool nodes
(browser/composio), memory — end to end. A brain is a specialized agent; the
TUI is its interface.

## Quick start

```sh
npm install
npm run build                 # bundles src/ -> dist/cli.js (esbuild)
node dist/cli.js ../my-brain.brain
```

## Usage

```
openbrain-tui <file.brain> [options]

  --runtime <url>   prefer the OpenBrain Runtime HTTP API (auto-falls back to in-process)
  --local           force in-process execution via brain-core.js
  --once <message>  run once headlessly and print the output (no TUI, good for scripts)
  --knowledge <dir> path to the RAG knowledge base (default: <cwd>/knowledge)
  -h, --help        show this help
```

Environment:

| Variable | Purpose |
| --- | --- |
| `OPENBRAIN_RUNTIME_URL` | default runtime URL (auto-fallback) |
| `OPENBRAIN_KNOWLEDGE_DIR` / `KNOWLEDGE_DIR` | RAG knowledge base directory |
| `FIREWORKS_API_KEY` | LLM nodes (in-process backend) |
| `COMPOSIO_API_KEY`, `COMPOSIO_ACCOUNT_ID`, `COMPOSIO_ENTITY_ID` | tool nodes |

## In-TUI commands

```
/help          show commands
/graph         dump the brain graph
/memory        show accumulated working memory
/clear         clear the screen
/clear-memory  reset working memory
/backend       show the active execution backend
/open <file>   swap to another .brain file
/exit  /quit   leave the TUI
```

Keys: `PgUp` / `PgDn` scroll the transcript, `Ctrl+C` quits.

## Live activity feed

While a run is in progress the TUI shows an animated, per-node panel above the
input so you can watch what the brain is actually doing:

```
⠋ browser  downloading 196 KB from apple.com
✓ rag       retrieved 1 document(s)
✓ browser   fetched 6,302 chars from apple.com
```

Each node type has its own color and progress detail:

- `browser` — streams the URL being fetched and a live byte counter as the
  page downloads, then a final char count.
- `rag` — shows each document being scanned (`scanned 2/5 files`), then how
  many documents were retrieved.
- `llm` — shows as a node step, with tokens streamed live in the transcript.
- finished steps collapse into a compact `✓` / `✗` history below the active one.

The feed works identically on the in-process backend and over the Runtime SSE
stream (`/run` with `stream: true`).

## Execution backend

By default the TUI runs in-process via `cloud-executor/brain-core.js` using the
local keys. Pass `--runtime <url>` (or set `OPENBRAIN_RUNTIME_URL`) to prefer
the Runtime HTTP API instead — it automatically falls back to in-process if the
Runtime is unreachable.

## Docker (standalone agent image)

The `openbrain-tui` image bundles the TUI plus the brain-core executor, so a
brain runs as its own agent container — no Runtime server required.

```sh
docker build -t openbrain-tui -f tui/Dockerfile .

docker run -it --rm \
  -v ./research.brain:/brain.brain \
  -e FIREWORKS_API_KEY=... \
  openbrain-tui /brain.brain

# headless / scripting
docker run --rm \
  -v ./research.brain:/brain.brain \
  -e FIREWORKS_API_KEY=... \
  openbrain-tui /brain.brain --once "Summarize Tesla's marketing strategy"
```

## Design notes

- The user's message is stamped onto every `llm` node as
  `configuration.userMessage` (mirroring the browser studio's chat pill), so
  agents work even on brains with no input edges.
- Brains are validated against the same rules as `brain validate`
  (`openbrain/brain`, version 1, no dangling edge references).
- The shared executor `cloud-executor/brain-core.js` is the same file the
  Runtime server and CLI use — one execution engine everywhere.
- **Real data, no canned output:** `browser` nodes fetch the actual page
  (MediaWiki plain-text API for Wikipedia, tag-stripped HTML otherwise) and
  `rag` nodes keyword-search the local knowledge base (`--knowledge` /
  `OPENBRAIN_KNOWLEDGE_DIR`, default `<cwd>/knowledge`), returning the top
  matches verbatim for the LLM to cite. This works identically in-process and
  through the Runtime.
- **Live progress events:** the executor emits structured events
  (`node-start`, `browser-fetch/progress/done`, `rag-scan/progress/done`,
  `node-done`) that the TUI renders as the animated activity feed. The same
  events stream over the Runtime SSE endpoint.

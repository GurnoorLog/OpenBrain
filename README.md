# OpenBrain — the local-first AI development platform

> **Status: early-stage, under active development.** This is a working prototype,
> not a finished product. Some edges are rough, a few features are incomplete,
> and there are known bugs (listed at the bottom). It is also, I believe, the
> seed of something much bigger — see **The Vision** below.

OpenBrain is a platform for building **AI "brains" as visual node graphs** —
think Unreal Engine's Blueprint system, but for software agents instead of
games. You arrange nodes on a canvas (LLM calls, web research, files, memory,
fine-tuning, GitHub, MCP tools…), connect them with edges, and a graph becomes
an **agent** that actually runs.

You don't even need to design the graph yourself. Type what you want in a
sentence and the **AI Architect** designs the graph for you, node by node, live
on the canvas.

Everything is **local-first**: your brains, data, models and keys live on your
machine. Self-host it with Docker, or run it with zero cloud dependencies.

---

## What it can do

### 1. Design brains visually — or just describe them
- **Visual canvas** with draggable nodes and connectable ports (like Unreal
  Blueprints).
- **AI Architect**: type `"Create a market research agent that analyzes a
  company's marketing"` and it designs the whole graph — reasoning included —
  revealing nodes one by one on the canvas.
- **Autosave & export**: brains are portable `.brain` files (a single JSON
  document) that you can check into version control, email, or move between
  machines.

### 2. Run brains as agents
- **Desktop app**: run the graph in the browser with a live Agent Log.
- **TUI** (`tui/`): turn any `.brain` file into an interactive terminal agent
  and chat with it. Headless mode for scripts.
- **Runtime server**: an HTTP API (`/run`, `/local/finetune`, `/agents`, …)
  that executes brains server-side.
- **Scheduled agents**: attach a cron schedule to a brain and it runs
  automatically.

### 3. Real tool nodes, not toys
The node library is real and executable:

| Node | What it does |
| --- | --- |
| `llm` | Cloud LLM call (Fireworks, or any OpenAI-compatible endpoint) |
| `local` | In-browser local model inference (e.g. SmolLM2) — no API key |
| `browser` | Fetches live web pages |
| `news` | News headlines |
| `github` | GitHub operations (via Composio) |
| `mcp` | Any MCP server (Model Context Protocol) |
| `filesystem` | Read/write local files |
| `python` | Run Python code |
| `rag` | Retrieval over your local knowledge base (`./knowledge`) |
| `finetune` | **Fine-tune a model — in the cloud OR on your own GPU** |
| `memory` | Cross-run memory |
| `planner` | Step planning |
| `imagegen` | Image generation |
| `agent` / `subbrain` | Nested agents / reusable sub-brains |
| `trigger` / `gate` | Flow control |
| `tool` | Curated skills (auto-review, TDD, security hardening, …) |

### 4. Fine-tuning: the centerpiece
This is the feature I'm proudest of. Ask the Architect to fine-tune a model and
you get a confirmation modal with a **dual choice**:

- **Fireworks (cloud)** — launches a real cloud training job on their GPUs
  (costs money, billed per token; RFT is free for models under 16B).
- **This machine** — trains **on your own GPU**, free, using the runtime's
  self-adaptive trainer. It **probes your machine at runtime** (CUDA, VRAM,
  installed libraries), picks a base model that actually fits your hardware
  (Qwen2.5 0.5B → 7B by VRAM tier), uses LoRA (or QLoRA if bitsandbytes is
  available), and streams live progress: `System probe: CUDA=True, GPU=...` →
  `step 0 · loss 6.18` → `adapter saved to workspace/finetunes/<job>/adapter`.

No hardcoded hardware — the same trainer adapts to a 4GB laptop or an A100.

### 5. Skills & plugins
- **Skills** (`skills/`) — curated sub-brain libraries for worker nodes
  (code review, spec-driven development, test-driven development, security
  hardening, handoff, document generation, and more).
- **Plugins** (`plugins/`) — a plugin API so anyone can add custom nodes,
  providers, and MCP connectors.

### 6. Portability
`.brain` files are the unit of everything. Same shape understood by the Desktop
app, the Runtime, the CLI, the TUI, and the SDK. Export a brain here, run it on
another machine — no cloud required.

---

## How to run it

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A [Fireworks API key](https://fireworks.ai/) (optional — local features work without one)

### One command — everything is set up

```bash
git clone https://github.com/GurnoorLog/OpenBrain.git
cd OpenBrain

# macOS / Linux
bash setup.sh

# Windows PowerShell
.\setup.ps1
```

The script will:
1. Check Docker is working
2. Ask for your API key (or skip for local-only mode)
3. Build and start the stack
4. Pull the local LLM model (~3GB, one-time)
5. Ask: **"Guide me"** or **"I know what I'm doing"**
   - **Guide me** — walks you through creating your first brain, testing it in the app, running it in the terminal, and exporting it
   - **Just open the app** — launches the browser and you're on your own

### What you can do in the app

1. **Create a brain** — type what you want in the chat, for example:
   > Create a market research agent that analyzes a company's marketing and gives improvement ideas.
   The AI Architect builds the brain for you, node by node, on the canvas.

2. **Run it** — click **"Activate Agent"**, then chat with your brain in the Agent panel.

3. **Export it** — your brain is a `.brain` file you can share, version control, or run anywhere.

### Test a brain in the terminal (TUI)

```bash
# Build the TUI (one-time)
cd tui && npm install && npm run build && cd ..

# Run any .brain file as a terminal chat
node tui/dist/cli.js create-a-market-research-agent-.brain

# Ask it something headless
node tui/dist/cli.js create-a-market-research-agent-.brain --once "Analyze Acme Corp's marketing"
```

### Fine-tune a model on your own GPU (optional)

In the browser, type a fine-tune prompt:
> Fine-tune an LLM to summarize city council minutes into plain language.

In the confirmation modal, select **"Train on: This machine"** and confirm.
Watch the training live in the Agent Log.

Or via the TUI:
```bash
node tui/dist/cli.js examples/local-finetune-demo.brain --local --once "run the fine-tune"
```

Requires: Python 3.10+, CUDA GPU, `pip install torch peft transformers bitsandbytes`.

### Stop / restart

```bash
docker compose down     # stop everything
docker compose up -d    # start again
```

### Prebuilt Docker image (no cloning needed)

```bash
docker pull praknoor/openbrain-runtime:0.1.3
docker run -d -p 8080:8080 --name openbrain-runtime praknoor/openbrain-runtime:0.1.3
# open http://127.0.0.1:8080
```

> For full setup instructions (Ollama, API keys, guided walkthrough), see the
> [main README](https://github.com/GurnoorLog/OpenBrain#readme).

### Example brains

| File | What it does |
| --- | --- |
| `create-a-market-research-agent-.brain` | Market research agent |
| `marketing-analyzer.brain` | Marketing analysis |
| `topic-brief.brain` | Topic briefing |
| `examples/local-finetune-demo.brain` | Local fine-tuning demo |

---

## API keys

| Key | Purpose |
| --- | --- |
| `FIREWORKS_API_KEY` | LLM nodes + AI Architect (cloud models) |
| `OLLAMA_URL` | Local models (no key) |
| `COMPOSIO_API_KEY` + `COMPOSIO_ACCOUNT_ID` + `COMPOSIO_ENTITY_ID` | GitHub / MCP tool nodes |
| `HF_TOKEN` | Hugging Face (datasets/models for fine-tuning) |

> **Security:** don't commit your `.env`. It holds live API keys.

---

## Architecture

```
src/            Desktop app — canvas, AI Architect, chat, reports
runtime/        Local runtime server — /run, /local/finetune, /agents, /registry
cloud-executor/ Shared graph executor (brain-core.js)
cli/            Command-line brain tools
sdk/            .brain file format + plugin API
tui/            Terminal UI — run .brain files as agents
skills/         Curated sub-brain libraries for worker nodes
plugins/        Plugin API (custom nodes, providers, MCP connectors)
knowledge/      Local knowledge base for rag nodes
workspace/      Your data — brains, finetunes, files (mounted in Docker)
```

See `ARCHITECTURE.md` for the deep dive and `ROADMAP.md` for what's next.

---

## Known bugs & unfinished edges

Honest list — I ran out of time before submission, and these are on my list:

1. **The Docker container can't do local fine-tuning** — it has no GPU and no
   Python, so `Train on this machine` only works when the app is served by a
   **host** runtime (`node runtime/server.js` with `DIST_DIR` set), not from
   inside the container. In the container it fails loudly with
   "Python not found" (honest, but not the ideal UX).
2. **Stale `wslrelay.exe` on the author's Windows machine shadows `::1`** — use
   `127.0.0.1`, not `localhost`, when opening the app.
3. **The browser modal uses cached bundles** after a rebuild — hard-refresh
   (Ctrl+F5) to see the latest UI.
4. **Tool/node edge cases** — a few node types (`imagegen`, some `trigger`/
   `gate` flows, `python` node) are implemented but lightly tested.
5. **Fireworks cloud fine-tuning** needs a valid `FIREWORKS_API_KEY`; without
   it the architect correctly refuses with "not configured".
6. **First local fine-tune downloads the base model** (~3GB for 1.5B) — looks
   stuck on slow connections; subsequent runs are instant.
7. **The AI Architect's clarifying-questions step is currently disabled**
   (design-first), so very ambiguous prompts may produce a generic graph.

---

## The Vision

OpenBrain is not "a drag-and-drop automation tool". I built it because I think
**node graphs are the next programming language**.

In Unreal Engine, you don't write C++ to place a door — you place a node,
connect it, and the engine compiles the graph. Software agents are fundamentally
*graphs*: a trigger feeds an input, the input feeds a model, the model's output
feeds a tool, the tool's result feeds a decision, and so on. Yet today we write
that plumbing by hand, in prose, inside `while` loops and `if` chains.

OpenBrain is my attempt to let people **program with nodes** — visual,
composable, inspectable, self-documenting graphs where every node is a real,
runnable capability (an LLM call, a web fetch, a file write, a fine-tune, a
scheduled trigger), and where the machine itself can **design the graph for
you** from a sentence.

Where I want to take this:
- A **proper graph compiler** — compile `.brain` graphs to code, with
  type-checked ports, loops, conditionals, and error handling as first-class
  graph constructs.
- **Reusable packages** — brains that ship like libraries, installable via the
  registry, versioned, composable.
- **Full local stack** — everything (including fine-tuning and inference) on
  your hardware, offline.
- **A plugin ecosystem** — nodes as a marketplace, the way Blueprints spawn
  plugins, and MCP makes that genuinely open.

It's at a very early phase. There are bugs, gaps, and rough edges — but the
foundation is real: the canvas, the architect, the executor, the runtime, the
fine-tuner, the portable `.brain` format. The path from here to "node graphs as
a language" is long, and I intend to keep walking it.

---

**OpenBrain — build your own mind.**

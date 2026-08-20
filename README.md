# OpenBrain

> **Still in beta.** This is the bare minimum — just the foundation. I have a
> long way to go before it's fully usable, so please forgive me if something
> doesn't work. But you can watch the video for a full feature showcase:
> **[Watch the demo](https://youtu.be/tX9TiHpuJhE?si=FQzuDhMjM4sVOkWC)**

**Build AI agents by drawing them.**

OpenBrain is a local-first platform where you design AI agents as visual node graphs. Drag nodes around, connect them, and watch your agent come to life. You can even describe what you want in plain English and an AI Architect will build the graph for you.

Your data stays on your machine. No cloud required.

---

## What is this?

Think of it like Unreal Engine's Blueprint system, but for AI agents instead of games. Each node is a real capability — an LLM call, a web search, a file operation, a fine-tune, a scheduled trigger. Connect them together and you get an agent that actually runs.

The best part? You don't have to be technical to use it. Just tell the AI what you want:

> "Create a market research agent that analyzes a company's marketing and suggests improvements"

And it builds the whole thing for you, node by node, right on the canvas.

---

## Features

**Visual Canvas** — Drag and drop nodes, connect them with edges, and watch your agent take shape. It feels like building with LEGOs, but for AI.

**AI Architect** — Describe what you want in a sentence. The Architect designs the entire graph for you, explaining its reasoning as it goes.

**Run Anywhere** — Use the browser app, a terminal (TUI), a REST API, or schedule agents to run automatically. Same `.brain` file works everywhere.

**Fine-tune on Your GPU** — Want to train a model on your own hardware? The self-adaptive trainer figures out what your GPU can handle and does it. No configuration needed.

**Real Tool Nodes** — This isn't a toy. You get LLM calls, web browsing, file I/O, GitHub integration, MCP servers, RAG, Python execution, image generation, and more.

**Portable `.brain` Files** — Export your agent as a single JSON file. Share it, version control it, run it on another machine. It just works.

---

## Quick Start

### Option 1: Clone and run (recommended)

```bash
git clone https://github.com/GurnoorLog/OpenBrain.git
cd OpenBrain
```

**macOS / Linux:**
```bash
bash setup.sh
```

**Windows PowerShell:**
```powershell
.\setup.ps1
```

The setup script handles everything — Docker, Ollama, model downloads, the works. It'll even walk you through creating your first brain if you want.

### Option 2: Docker only

```bash
docker pull praknoor/openbrain-runtime:0.1.3
docker run -d -p 8080:8080 --name openbrain-runtime praknoor/openbrain-runtime:0.1.3
```

Then open **http://127.0.0.1:8080** in your browser.

> For the full guided experience (Ollama setup, API keys, walkthrough), follow the
> [complete setup instructions](https://github.com/GurnoorLog/OpenBrain#how-to-run-it).

---

## Using the app

1. **Create a brain** — Type what you want in the chat box. The AI Architect builds it for you.
2. **Run it** — Click "Activate Agent" and chat with your brain in the Agent panel.
3. **Export it** — Save as a `.brain` file and take it anywhere.

### Running in the terminal

```bash
# Build the TUI (one-time)
cd tui && npm install && npm run build && cd ..

# Chat with a brain
node tui/dist/cli.js your-brain.brain

# One-shot question
node tui/dist/cli.js your-brain.brain --once "Analyze Nike's marketing strategy"
```

### Fine-tuning locally

Type a fine-tune prompt in the app:

> "Fine-tune an LLM to summarize city council minutes into plain language"

Pick "Train on this machine" in the confirmation modal and watch it go. It works on any CUDA GPU — from a 4GB laptop to an A100. No setup required.

Or from the terminal:
```bash
node tui/dist/cli.js examples/local-finetune-demo.brain --local --once "run the fine-tune"
```

Requires: Python 3.10+, CUDA GPU, `pip install torch peft transformers bitsandbytes`.

---

## Stopping and restarting

```bash
docker compose down     # stop everything
docker compose up -d    # start again
```

---

## Included brains

| File | What it does |
| --- | --- |
| `create-a-market-research-agent-.brain` | Market research agent |
| `marketing-analyzer.brain` | Marketing analysis |
| `topic-brief.brain` | Topic briefing |
| `examples/local-finetune-demo.brain` | Local fine-tuning demo |

---

## API Keys

| Key | What it's for |
| --- | --- |
| `FIREWORKS_API_KEY` | Cloud LLM and AI Architect (optional if using Ollama) |
| `OLLAMA_URL` | Local models (free, no key needed) |
| `COMPOSIO_API_KEY` + `COMPOSIO_ACCOUNT_ID` + `COMPOSIO_ENTITY_ID` | GitHub and MCP tool nodes |
| `HF_TOKEN` | Hugging Face (for fine-tuning datasets/models) |

**Don't commit your `.env` file.** It contains live API keys.

---

## How it's built

```
src/            Browser app — canvas, AI Architect, chat, reports
runtime/        Local runtime server — /run, /local/finetune, /agents
cloud-executor/ Shared graph executor (brain-core.js)
cli/            Command-line brain tools
sdk/            .brain file format and plugin API
tui/            Terminal UI — run .brain files as chat agents
skills/         Curated sub-brain libraries for worker nodes
plugins/        Plugin API for custom nodes and providers
knowledge/      Local knowledge base for RAG nodes
workspace/      Your data — brains, finetunes, files (mounted in Docker)
```

See `ARCHITECTURE.md` for the deep dive and `ROADMAP.md` for what's coming next.

---

## Known issues

Being honest — this is a hackathon prototype, not a finished product. Here's what's rough:

1. **Docker can't fine-tune locally** — the container has no GPU or Python. Use the host runtime for local training.
2. **Use `127.0.0.1`, not `localhost`** — on Windows, `localhost` can resolve to IPv6 which causes connection issues.
3. **Browser caches old bundles** — hard-refresh (Ctrl+F5) after a rebuild.
4. **Some node types are lightly tested** — `imagegen`, certain `trigger`/`gate` flows, and the `python` node work but haven't been battle-hardened.
5. **Cloud fine-tuning needs a Fireworks key** — without one, the Architect will let you know it's not configured.
6. **First local fine-tune downloads the base model** (~3GB) — looks stuck on slow connections, but subsequent runs are instant.
7. **The Architect skips clarifying questions** — very vague prompts might produce a generic graph.

---

## Why I built this

I believe **node graphs are the next programming language**.

In Unreal Engine, you don't write C++ to place a door — you place a node, connect it, and the engine does the rest. Software agents are fundamentally graphs: a trigger feeds an input, the input feeds a model, the model feeds a tool, the tool feeds a decision. Yet today we write all that plumbing by hand in code.

OpenBrain is my attempt to let people **program with nodes** — visual, composable, self-documenting graphs where every node is a real, runnable capability. And where the machine can design the graph for you from a sentence.

Where this is going:
- **A graph compiler** — compile `.brain` graphs to type-checked code
- **Reusable packages** — brains that ship like libraries, installable and composable
- **Full local stack** — everything runs on your hardware, even offline
- **A plugin ecosystem** — nodes as a marketplace, built on MCP

It's early. There are bugs and rough edges. But the foundation is real — and I'm keeping at it.

---

**OpenBrain — build your own mind.**

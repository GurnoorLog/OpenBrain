# OpenBrain

> **Beta.** Bare minimum right now — just the bones. I'm still building it, and
> stuff will break. Forgive me. But you can see what it's supposed to do here:
> **[Watch the demo](https://youtu.be/tX9TiHpuJhE?si=FQzuDhMjM4sVOkWC)**

**Build AI agents by drawing them.**

OpenBrain lets you design AI agents as visual node graphs. You drag nodes around a canvas, connect them, and they become an agent that does things. Type what you want in English and an AI Architect builds the whole graph for you.

Your data stays on your machine.

---

## What is this?

If you've used Unreal Engine's Blueprints, you'll get it immediately. It's that, but for AI agents. Each node on the canvas is a real thing your agent can do — call an LLM, search the web, read a file, run Python, fine-tune a model, whatever. Connect them up and you've got an agent.

You don't need to build the graph yourself. Just say what you want:

> "Create a market research agent that analyzes a company's marketing and suggests improvements"

The Architect figures out the nodes, the reasoning, the connections — builds it right there on the canvas while you watch.

---

## What's in here

**Visual canvas.** Drag, drop, connect. Feels like building with blocks, except the blocks actually do things.

**AI Architect.** Tell it what you want. It designs the whole graph, explains why it picked each node.

**Run it anywhere.** Browser app, terminal, REST API, scheduled cron job — same `.brain` file works in all of them.

**Fine-tune on your GPU.** The trainer figures out what your hardware can handle (CUDA, VRAM, whatever you've got) and picks a model that fits. Works on a 4GB laptop or an A100. No config needed.

**Real tools, not demos.** LLM calls, web browsing, file I/O, GitHub, MCP servers, RAG, Python, image generation. These actually execute.

**`.brain` files.** Export your agent as one file. Move it between machines, share it, version control it.

---

## Quick start

### Clone and run

```bash
git clone https://github.com/GurnoorLog/OpenBrain.git
cd OpenBrain

# macOS / Linux
bash setup.sh

# Windows PowerShell
.\setup.ps1
```

The script does the Docker setup, Ollama config, model downloads — all of it. It can also walk you through building your first brain step by step.

### Docker only

```bash
docker pull praknoor/openbrain-runtime:0.1.3
docker run -d -p 8080:8080 --name openbrain-runtime praknoor/openbrain-runtime:0.1.3
```

Open http://127.0.0.1:8080 in your browser.

---

## Using it

1. Type what you want in the chat. The Architect builds a brain from your description.
2. Click "Activate Agent" and talk to it in the Agent panel.
3. Export as a `.brain` file when you're done.

### Terminal

```bash
cd tui && npm install && npm run build && cd ..
node tui/dist/cli.js your-brain.brain
node tui/dist/cli.js your-brain.brain --once "Analyze Nike's marketing"
```

### Fine-tuning

Type something like "Fine-tune an LLM to summarize city council minutes" in the app. Pick "Train on this machine." It works.

Or from the terminal:
```bash
node tui/dist/cli.js examples/local-finetune-demo.brain --local --once "run the fine-tune"
```

Needs Python 3.10+, a CUDA GPU, and `pip install torch peft transformers bitsandbytes`.

---

## Included brains

| File | What it does |
| --- | --- |
| `create-a-market-research-agent-.brain` | Market research agent |
| `marketing-analyzer.brain` | Marketing analysis |
| `topic-brief.brain` | Topic briefing |
| `examples/local-finetune-demo.brain` | Local fine-tuning demo |

---

## API keys

| Key | For |
| --- | --- |
| `FIREWORKS_API_KEY` | Cloud LLM and AI Architect (skip if using Ollama) |
| `OLLAMA_URL` | Local models, free, no key |
| `COMPOSIO_API_KEY` + `COMPOSIO_ACCOUNT_ID` + `COMPOSIO_ENTITY_ID` | GitHub and MCP tools |
| `HF_TOKEN` | Hugging Face for fine-tuning |

Don't commit your `.env`. It has real keys in it.

---

## Project structure

```
src/            Browser app — canvas, AI Architect, chat
runtime/        Runtime server — /run, /local/finetune, /agents
cloud-executor/ Graph executor (brain-core.js)
cli/            Command-line tools
sdk/            .brain format + plugin API
tui/            Terminal UI
skills/         Sub-brain libraries for worker nodes
plugins/        Plugin API
knowledge/      RAG knowledge base
workspace/      Your data, mounted in Docker
```

`ARCHITECTURE.md` has the real details. `ROADMAP.md` has what's next.

---

## Known issues

This is a hackathon prototype. Things are rough:

1. Docker can't fine-tune locally — the container has no GPU or Python. Use the host runtime for training.
2. On Windows, use `127.0.0.1` instead of `localhost`. IPv6 resolution causes problems.
3. Browser caches old bundles. Hard-refresh (Ctrl+F5) after rebuilding.
4. Some nodes are lightly tested — `imagegen`, certain `trigger`/`gate` flows, `python`.
5. Cloud fine-tuning needs a Fireworks key. Without one, the Architect tells you it's not configured.
6. First local fine-tune downloads the base model (~3GB). Looks stuck, but next time is fast.
7. The Architect skips clarifying questions. Vague prompts give generic graphs.

---

## Why

I think node graphs are how we'll build agents eventually.

Right now, building an agent means writing code — while loops, if chains, function calls. It's plumbing. Agents are really graphs: a trigger feeds an input, the input feeds a model, the model feeds a tool, the tool feeds a decision. We just don't have good tools for designing them visually yet.

OpenBrain is my attempt at that. Every node on the canvas is real and runnable. The machine can design the graph from a sentence. And `.brain` files move between any runtime — browser, terminal, API, scheduler.

It's early. Bugs everywhere. But the bones are there, and I'm keeping at it.

---

**OpenBrain — build your own mind.**

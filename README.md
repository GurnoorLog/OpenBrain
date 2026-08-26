# OpenBrain

Still beta. I'm building this as I go. Things will break, and I'm sorry about that.
Here's a video showing what it actually does right now:
[Watch the demo](https://youtu.be/tX9TiHpuJhE?si=FQzuDhMjM4sVOkWC)

You draw AI agents and they just work.

That's the whole idea. You drag nodes around a canvas, wire them up, and you've got an agent. Or you type a sentence and an AI builds the whole graph for you. Everything runs on your machine.

---

## What is this

Think Unreal Engine Blueprints, but for AI. Each node on the canvas does something real. Calls an LLM. Grabs a webpage. Reads a file. Runs code. Connect them and you have an agent.

Or just tell the AI what you want:

> "Create a market research agent that analyzes a company's marketing and suggests improvements"

It builds the graph for you. You watch it happen.

---

## What's here

**Canvas.** Drag nodes, connect them, watch it come together. Like LEGOs that actually do stuff.

**AI Architect.** Say what you want. It figures out the nodes and why each one matters.

**Works everywhere.** Browser, terminal, REST API, scheduled jobs. Same `.brain` file in all of them.

**Fine-tune on your GPU.** The trainer looks at your hardware and picks a model that fits. Doesn't matter if you've got a 4GB laptop or an A100.

**Actually functional tools.** LLM calls, web scraping, file I/O, GitHub, MCP, RAG, Python, image gen. Not placeholders.

**`.brain` files.** Export your agent as one file. Pass it around, version control it, run it somewhere else.

---

## Get started

```bash
git clone https://github.com/GurnoorLog/OpenBrain.git
cd OpenBrain

# macOS / Linux
bash setup.sh

# Windows PowerShell
.\setup.ps1
```

The script handles Docker, Ollama, downloading models. All of it. It can also walk you through making your first brain.

---

## How to use it

1. Describe what you want in the chat. The Architect builds a brain from it.
2. Hit "Activate Agent" and talk to your brain.
3. Export as a `.brain` file when you're happy with it.

### Terminal

```bash
cd tui && npm install && npm run build && cd ..
node tui/dist/cli.js your-brain.brain
node tui/dist/cli.js your-brain.brain --once "Analyze Nike's marketing"
```

### Fine-tuning

Type something like "Fine-tune an LLM to summarize city council minutes" in the app. Pick "Train on this machine." It does the rest.

Or from terminal:
```bash
node tui/dist/cli.js examples/local-finetune-demo.brain --local --once "run the fine-tune"
```

You need Python 3.10+, a CUDA GPU, and `pip install torch peft transformers bitsandbytes`.

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
| `FIREWORKS_API_KEY` | Cloud LLM and AI Architect (not needed if using Ollama) |
| `OLLAMA_URL` | Local models, free, no key |
| `COMPOSIO_API_KEY` + `COMPOSIO_ACCOUNT_ID` + `COMPOSIO_ENTITY_ID` | GitHub and MCP tools |
| `HF_TOKEN` | Hugging Face for fine-tuning |

Don't commit your `.env`. It has real keys.

---

## How it's built

```
src/            Browser app: canvas, AI Architect, chat
runtime/        Runtime server: /run, /local/finetune, /agents
cloud-executor/ Graph executor (brain-core.js)
cli/            Command-line tools
sdk/            .brain format + plugin API
tui/            Terminal UI
skills/         Sub-brain libraries for worker nodes
plugins/        Plugin API
knowledge/      RAG knowledge base
workspace/      Your data, mounted in Docker
```

---

## What's coming

Right now you have to run Docker, mess with setup scripts, use the terminal. That's a lot. I'm building a desktop app so you can just open it and go. That's the next big thing.

Also working on a graph compiler to turn `.brain` files into real code. Reusable packages so you can install brains like libraries. Full local stack with no cloud needed. And a plugin system built on MCP.

---

## Known issues

1. Docker can't fine-tune locally. No GPU or Python in the container. Use the host runtime.
2. On Windows, use `127.0.0.1` instead of `localhost`. IPv6 causes problems.
3. Browser caches old bundles. Hard-refresh (Ctrl+F5) after rebuilding.
4. Some nodes are lightly tested. `imagegen`, certain `trigger`/`gate` flows, `python`.
5. Cloud fine-tuning needs a Fireworks key.
6. First local fine-tune downloads the base model (around 3GB). Slow once, fast after.
7. Vague prompts give generic graphs.

---

## Why

I think node graphs are how we'll eventually build agents.

Right now you write code. Loops, if chains, function calls. It's plumbing. But agents are really graphs. Trigger, input, model, tool, decision. We just don't have good tools for building them visually.

OpenBrain is that tool. Every node is real. The machine designs the graph from a sentence. `.brain` files work everywhere.

Still early. Still buggy. But it's real and I'm keeping at it.

---

**OpenBrain. Build your own mind.**

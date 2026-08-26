# OpenBrain

> **Beta.** I'm still working on this. Stuff will break. Forgive me.
> For a full walkthrough of what it does, watch the video:
> [Watch the demo](https://youtu.be/tX9TiHpuJhE?si=FQzuDhMjM4sVOkWC)

**Build AI agents by drawing them.**

You design AI agents as visual node graphs — drag nodes around, connect them, and they become something that actually runs. You can also just describe what you want in plain English and an AI Architect builds the whole graph for you. Your data stays on your machine.

---

## What is this?

You know Unreal Engine's Blueprints? Same idea, but for AI agents instead of games. Each node is a real thing your agent can do — call an LLM, search the web, read a file, run Python, fine-tune a model. Connect them and you've got an agent.

Tell the AI what you want:

> "Create a market research agent that analyzes a company's marketing and suggests improvements"

It figures out the nodes, the reasoning, the connections. Builds it on the canvas while you watch.

---

## What's in here

**Visual canvas.** Drag, drop, connect. Like building with blocks, except the blocks do things.

**AI Architect.** Describe what you want. It designs the graph and explains why it picked each node.

**Run it anywhere.** Browser app, terminal, REST API, cron job — same `.brain` file works in all of them.

**Fine-tune on your GPU.** The trainer checks your hardware (CUDA, VRAM, what you've got) and picks a model that fits. 4GB laptop or A100, doesn't matter. No setup.

**Real tools, not demos.** LLM calls, web browsing, file I/O, GitHub, MCP servers, RAG, Python, image generation. They actually run.

**`.brain` files.** Export your agent as one file. Move it, share it, version control it.

---

## Quick start

```bash
git clone https://github.com/GurnoorLog/OpenBrain.git
cd OpenBrain

# macOS / Linux
bash setup.sh

# Windows PowerShell
.\setup.ps1
```

The script handles Docker, Ollama, model downloads — everything. It can walk you through creating your first brain too.

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

Type something like "Fine-tune an LLM to summarize city council minutes" in the app. Pick "Train on this machine." Done.

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

---

## What's next

I'm turning this into a desktop app. Right now you have to run Docker, use the terminal, deal with setup scripts — that's a lot. A proper desktop app will make it way easier to just open and use. That's the next big thing.

I'm also working on:
- A graph compiler — turning `.brain` files into real code
- Reusable packages — brains you can install like libraries
- Full local stack — everything on your machine, no cloud
- A plugin ecosystem — custom nodes built on MCP

---

## Known issues

Here's what's broken:

1. Docker can't fine-tune locally — no GPU or Python in the container. Use the host runtime.
2. On Windows, use `127.0.0.1` not `localhost`. IPv6 causes issues.
3. Browser caches old bundles. Hard-refresh (Ctrl+F5) after rebuilding.
4. Some nodes are lightly tested — `imagegen`, certain `trigger`/`gate` flows, `python`.
5. Cloud fine-tuning needs a Fireworks key.
6. First local fine-tune downloads the base model (~3GB). Slow once, fast after.
7. Vague prompts give generic graphs — the Architect skips clarifying questions right now.

---

## Why

I think node graphs are how we'll build agents eventually.

Building an agent right now means writing code. While loops, if chains, function calls. It's plumbing. Agents are really graphs — a trigger feeds an input, the input feeds a model, the model feeds a tool, the tool feeds a decision. We just don't have good tools for designing them visually yet.

OpenBrain is my attempt. Every node is real and runnable. The machine designs the graph from a sentence. `.brain` files move between any runtime.

Early days. Bugs everywhere. But the bones are there and I'm keeping at it.

---

**OpenBrain — build your own mind.**

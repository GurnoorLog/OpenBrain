# OpenBrain Roadmap

OpenBrain's long-term goal: become the operating system for AI-native software —
a single environment combining natural language, visual graphs, traditional
code, AI models, MCP tools, RAG, memory and custom plugins.

## Done (foundation, this milestone)

- [x] **Self-hosted stack** — `docker compose up` runs OpenBrain (Desktop +
      Runtime) + Ollama; optional `infra` (PostgreSQL, Redis, Qdrant),
      `mcp`, and `supabase` profiles.
- [x] **OpenBrain Runtime** — serves the app, executes brains locally, exposes
      `/local/files`, `/local/finetune`, `/registry`, `/plugins`, `/system`.
- [x] **OpenBrain CLI** — `init / open / run / export / validate / doctor /
      plugins / logs`.
- [x] **OpenBrain SDK** — `.brain` helpers, plugin manifests + loader, Runtime
      client.
- [x] **`.brain` file format** — first-class project files, import/export in
      the Desktop, legacy export upgrade.
- [x] **Plugin scaffold** — manifest schema, Desktop registry module, Runtime
      `/plugins`, example weather node plugin.
- [x] **Local-first providers** — Ollama support, dynamic provider switching.

## Next (short term)

- [ ] **Runtime ↔ Desktop wiring** — Desktop discovers the local Runtime
      (`VITE_RUNTIME_URL`) and uses `/local/files`, `/registry` and Ollama by
      default when available, falling back to cloud only when configured.
- [ ] **Custom node execution from plugins** — Runtime dispatches unknown node
      types to plugin `execute()` hooks; Desktop renders plugin nodes from
      manifests.
- [ ] **`brain run` streaming** — SSE progress from Runtime to CLI/Desktop.
- [ ] **`brain deploy`** — publish a `.brain` to the Registry; draft
      Marketplace sync.
- [x] **Local fine-tune trainer** — real on-machine LoRA/QLoRA training behind
      `/local/finetune` and the `finetune` brain node. The trainer probes the
      host (CUDA/VRAM/libs), adapts model + method to what fits, trains with
      transformers+peft, streams progress, and saves the adapter into the
      workspace with `GET /local/finetune/<jobId>` polling.

## Later

- [ ] **SDK for custom providers** — OpenAI, Anthropic, Gemini, Groq, HF.
- [ ] **Registry UI** — browse/template library inside the Desktop.
- [ ] **Marketplace** — online package repository with versioning and install
      UX.
- [ ] **Layout engines** — plugin-provided graph layout algorithms.
- [ ] **Exporters** — plugin-provided report/export formats.
- [ ] **Brains as products** — publish a brain, share it via `.brain` or link.

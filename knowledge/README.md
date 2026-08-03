# Knowledge Base

Drop plain-text documents here (`.md`, `.txt`, `.json`, `.csv`, `.html`) and the
RAG node will keyword-search them and feed the top matches to the LLM.

The TUI/Runtime looks for this folder at:

- `--knowledge <dir>` on the CLI
- `$OPENBRAIN_KNOWLEDGE_DIR` or `$KNOWLEDGE_DIR`
- `<cwd>/knowledge` (repo root) — the in-process/TUI default
- `<WORKSPACE>/knowledge` — the Runtime container default (`./workspace` on the host)

The files in this folder are real retrieval sources — the LLM can cite them
exactly as written. Remove this README if you don't want it searched.

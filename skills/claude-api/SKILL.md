---
name: claude-api
description: Reference for the Claude API / Anthropic SDK — model ids, params, streaming, tool use, MCP, agents, caching, token counting, model migration. TRIGGER — read before writing any Claude/Anthropic SDK code, or any LLM-shaped task with no provider named.
source: https://github.com/anthropics/skills/blob/main/skills/claude-api/SKILL.md
---

# Building LLM-Powered Applications with Claude

Build with the official Anthropic SDK for the project language (`anthropic`, `@anthropic-ai/sdk`, `com.anthropic.*`). Raw HTTP only when the user asks for cURL or no SDK exists. Never mix the two; never guess SDK usage — verify signatures against docs.

## Defaults

- Model: `claude-opus-5` (exact ID, no date suffix) unless the user names another
- Adaptive thinking: `thinking: {type: "adaptive"}` for anything remotely complicated
- Streaming for any long input/output/high max_tokens request

## API Drift (2025–2026)

| Stale prior | Current API |
|---|---|
| `thinking: {type:"enabled", budget_tokens:N}` | `thinking: {type:"adaptive"}`; `budget_tokens` rejected on 4.6+ models |
| `web_search_20250305` | `web_search_20260209` / `web_fetch_20260209` (dynamic filtering) on current models |
| top-level `temperature` | sampling removed on 4.6+; use `output_config.effort` (low–max) |
| `output_format` | `output_config: {format: {...}}` + `client.messages.parse()` |

## Quick References

- **Prompt caching**: prefix-matched; stable content first, volatile after last `cache_control` breakpoint; max 4 breakpoints; verify with `usage.cache_read_input_tokens`.
- **Compaction**: beta `compact-2026-01-12`; append `response.content` back on every turn or compaction state is lost.
- **Token counting**: `POST /v1/messages/count_tokens`; model capability lookup via Models API.
- **Agents**: single call for classification/summarization; tool use for multi-step; Managed Agents only for hosted/stateful/scheduled agents.
- **Credentials**: unset `ANTHROPIC_API_KEY` doesn't mean no creds — check `ant auth status` / OAuth profiles before asking the user for a key.

Never answer model/pricing/limits questions from memory — consult live sources. For migration, read the model-migration guide and confirm scope before editing.

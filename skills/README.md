# OpenBrain Skills Library

Curated **Agent Skills** (SKILL.md format) imported from public GitHub repositories.
Each skill doubles as a **sub-brain template**: the architect can emit a `worker` node whose
`configuration.brain` references a skill id/name, and the WorkerNodeExecutor runs it as its
own llm pipeline (skill instructions = system prompt, delegated task = user message).

## What is a skill?

A folder with a `SKILL.md` (YAML frontmatter: `name` + `description`, then markdown instructions).
This is the open [Agent Skills](https://agentskills.io) format used by Claude Code, OpenClaw,
Codex, and Cursor. OpenBrain consumes it as a reusable sub-brain.

## Sources

| Skill | Source repo |
|---|---|
| `test-driven-development` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/test-driven-development) |
| `code-review-and-quality` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/code-review-and-quality) |
| `spec-driven-development` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/spec-driven-development) |
| `security-and-hardening` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/security-and-hardening) |
| `claude-api` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/claude-api) |
| `document-pptx` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/pptx) |
| `autoreview` | [openclaw/agent-skills](https://github.com/openclaw/agent-skills/tree/main/skills/autoreview) |
| `handoff` | [openclaw/agent-skills](https://github.com/openclaw/agent-skills/tree/main/skills/handoff) |

## How to add a skill

1. Create `skills/<id>/SKILL.md` (agentskills format: `name`, `description` frontmatter).
2. Add a matching entry to `src/core/skills/skillLibrary.ts` — `id`, `name`, `description`,
   `useWhen` keywords, `inputs`/`outputs` ports, `source`, and `instructions`
   (the system prompt for the skill's sub-brain llm node).
3. The skill appears automatically in the architect's prompt and worker catalog.

## The "main brain + sub brain" pattern

For autonomous/repeating agents the architect emits a **main brain** (coordinator llm + schedule)
whose `worker` nodes delegate to skill sub-brains — each skill is a reusable specialist that runs
as its own graph. This mirrors the graph-of-skills / progressive-reference-architecture pattern:
a router brain that loads only the sub-brains the task needs.

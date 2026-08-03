---
name: autoreview
description: Structured closeout of a completed change: self-review the diff, verify behavior against the contract, and summarize what changed and how it was verified.
source: https://github.com/openclaw/agent-skills/blob/main/skills/autoreview/SKILL.md
---

# Autoreview & Closeout

## Overview

Before declaring work done, review your own change as if a stranger wrote it, and record provenance: what changed and how it was proven.

## Closeout Checklist

1. **Re-read the diff** — does it match the original task? No stray edits.
2. **Verify behavior against the contract** — what should observably change, and does it?
3. **Record provenance** — task, files changed, commands that verified it (tests, build, typecheck, lint, manual steps).
4. **Be honest** — list gaps and known limitations, not just wins.

## Output

- One-paragraph summary of the change
- Bullet list of what was verified and how
- Explicit "follow-ups" for anything not proven

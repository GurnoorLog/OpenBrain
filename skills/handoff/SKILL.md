---
name: handoff
description: Produces a self-contained, path-free handoff brief so another agent or human can pick up a task with zero context loss.
source: https://github.com/openclaw/agent-skills/blob/main/skills/handoff/SKILL.md
---

# Handoff & Delegation

## Overview

Write a self-contained, path-free handoff brief. The receiver must need zero prior context.

## Brief Structure

1. **Objective** — what the task is and what "done" looks like
2. **Current state** — done / in flight / blocked (with reasons)
3. **Decisions** — key choices already made and why (don't re-litigate)
4. **Next steps** — concrete ordered actions for the receiver
5. **Gotchas** — pitfalls, assumptions, things to verify first

## Rules

- No internal session state, no absolute paths the receiver can't resolve
- Describe work in terms of intent and outcomes
- End with the complete handoff brief

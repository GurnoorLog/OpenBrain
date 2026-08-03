---
name: spec-driven-development
description: Creates specs before coding. Use when starting a new project, feature, or significant change and no specification exists yet. Use when requirements are unclear, ambiguous, or only exist as a vague idea.
source: https://github.com/addyosmani/agent-skills/blob/main/skills/spec-driven-development/SKILL.md
---

# Spec-Driven Development

## Overview

Write a structured specification before writing any code. The spec is the shared source of truth — it defines what we're building, why, and how we'll know it's done. Code without a spec is guessing.

## The Gated Workflow

```
SPECIFY → PLAN → TASKS → IMPLEMENT
   (each phase validated by a human before advancing)
```

### Phase 1: Specify

Surface assumptions immediately before writing content. Ask clarifying questions until requirements are concrete. Reframe vague instructions as specific, testable success criteria.

Write a spec covering:
1. **Objective** — what/why, who the user is, what success looks like
2. **Commands** — full executable commands with flags
3. **Project Structure** — where code, tests, and docs live
4. **Code Style** — one real snippet beats three paragraphs
5. **Testing Strategy** — framework, locations, coverage
6. **Boundaries** — Always do / Ask first / Never do
7. **Success Criteria** and **Open Questions**

### Phase 2: Plan

Components and dependencies, implementation order, risks + mitigations, parallel vs sequential work, verification checkpoints.

### Phase 3: Tasks

Each task: completable in one session, explicit acceptance criteria, a verification step, ~5 files max, ordered by dependency.

### Phase 4: Implement

Execute tasks one at a time. Keep the spec alive — update it when decisions or scope change, commit it, reference it in PRs.

## Verification

- [ ] Spec covers all six core areas
- [ ] Success criteria are specific and testable
- [ ] Boundaries defined
- [ ] Spec saved to the repository

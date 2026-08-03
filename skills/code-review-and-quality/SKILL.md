---
name: code-review-and-quality
description: Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you need to assess code quality across multiple dimensions before it enters the main branch.
source: https://github.com/addyosmani/agent-skills/blob/main/skills/code-review-and-quality/SKILL.md
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Review covers five axes: correctness, readability, architecture, security, and performance.

**Approval standard:** Approve a change when it definitely improves overall code health, even if imperfect. Don't rubber-stamp, don't soften real issues, don't block on style.

## The Five-Axis Review

1. **Correctness** — matches spec; edge cases, error paths; tests test the right things.
2. **Readability** — clear names, straightforward control flow, abstractions earn their complexity, no dead code.
3. **Architecture** — follows existing patterns, clean boundaries, no feature logic in shared modules, refactors reduce complexity rather than relocate it.
4. **Security** — input validated at boundaries, no secrets, no injection, external data untrusted.
5. **Performance** — no N+1, no unbounded loops, pagination present.

## Process

1. Understand the context and intent.
2. Review the tests first (they reveal intent).
3. Review the implementation with the five axes.
4. Categorize findings: **Critical** (blocks merge) / no-prefix (required) / **Nit** / **Optional** / **FYI**.
5. Verify the author's verification story.

Lead with what matters — correctness and security first, then structure, then nits. Propose structural remedies, not just problems.

## Change Sizing

~100 lines changed → good; ~300 acceptable for one logical change; ~1000 → split it. Keep files under ~1000 total lines. Separate refactoring from feature work. Upgrade dependencies one per change, read the changelog, keep the lockfile honest.

## Verification

- [ ] All Critical issues resolved
- [ ] All required changes resolved or explicitly deferred
- [ ] Tests pass, build succeeds, verification story documented

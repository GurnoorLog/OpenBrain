---
name: test-driven-development
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality.
source: https://github.com/addyosmani/agent-skills/blob/main/skills/test-driven-development/SKILL.md
---

# Test-Driven Development

## Overview

Write a failing test before writing the code that makes it pass. For bug fixes, reproduce the bug with a test before attempting a fix. Tests are proof — "seems right" is not done.

## The TDD Cycle

```
RED  →  write a test that fails
GREEN → write minimal code to make it pass
REFACTOR → clean up, tests still pass
```

## The Prove-It Pattern (Bug Fixes)

Bug report → write a reproduction test → it FAILS (bug confirmed) → implement the fix → test PASSES → run full suite (no regressions).

## Key Principles

- **Discover the stack first**: use the repo's actual test tooling (package.json, ./gradlew, pytest, go test) — never assume `npm test`.
- **Test state, not interactions**: assert on outcomes, not which methods were called.
- **DAMP over DRY in tests**: each test reads like a specification.
- **Prefer real implementations**: real > fake > stub > mock. Mock only at slow/non-deterministic boundaries.
- **Arrange-Act-Assert**, one behavior per test, descriptive test names.
- **Test pyramid**: ~80% small fast unit tests, ~15% integration, ~5% E2E.

## Verification

- [ ] Every new behavior has a test
- [ ] Full suite passes with the repo's own command
- [ ] Bug fixes include a reproduction test that failed first
- [ ] No tests skipped

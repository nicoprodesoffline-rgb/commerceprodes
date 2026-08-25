# Startup Context Pilot — 2026-04-21

## Goal

Reduce startup context overhead in `commerce` without changing app behavior.

## Changes

- added compact startup files in `.claude/`
- reduced `CLAUDE.md` to an entrypoint file
- moved detailed session mechanics to `.claude/SESSION_PROTOCOL.md`
- made parent `state/*` reads conditional instead of default
- added `.claudeignore` for bulky historical docs and non-startup material

## Principle

Cold start should load:
- one compact root instruction file
- a few focused `.claude/*` files
- detailed orchestration state only when the task needs it

## Measured Direction

Previous startup pack used in practice:
- `CLAUDE.md`
- `AGENTS.md`
- `state/orchestrator.json`
- `state/roadmap.json`
- `state/handoff.json`

Observed size before pilot:
- about `47k` chars total

The biggest offender was not the response style. It was the startup context shape, especially `state/handoff.json`.

## Tool Conclusions

- `claude-token-optimizer`: good fit as a method
- `claude-token-efficient`: useful as a small behavior overlay
- `caveman`: not a good default fit for collaboration tone here
- `DSPy RLM`: interesting future pattern for large-context tooling, not a startup optimization tool

## Decision

Keep this pilot if:
- startup feels simpler
- sessions need fewer bulky reads before coding
- no critical orchestration behavior is lost

Rollback is easy:
- restore previous `CLAUDE.md`
- remove `.claudeignore`
- remove added `.claude/*.md` files


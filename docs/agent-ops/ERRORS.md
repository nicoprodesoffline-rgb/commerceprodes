# Agent Ops Errors

Durable log of approaches that failed and what worked instead. Check this before repeating a similar workflow.

## 2026-05-12 — Commerce skill evals need real eval shape

Repo: `commerce`

**What did not work:** Treating skill evals as a future placeholder.

**What worked:** Adding optimization and holdout eval cases with prompt, expected output, assertions, tags, and split.

**Note for next time:** Every new skill should ship with at least one optimization eval and one holdout eval.

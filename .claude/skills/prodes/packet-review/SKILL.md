---
name: packet-review
description: Review a task packet for completeness, scope clarity, stop conditions and risk assessment before handing it to Codex
---

# Task Packet Review

You are a meticulous Tech Lead reviewing a task packet before it goes to Codex for execution.
Your job is to catch ambiguity, scope drift risk, and missing guardrails BEFORE execution starts.

## What to review

Read the task packet (provided or in `state/task-packets/`) and check:

### 1. Intent clarity

- Is the intent one of: analysis | implementation | review | repair | synthesis?
- Is the goal stated in one sentence without ambiguity?
- Could two different developers interpret this differently? If yes, flag it.

### 2. Scope boundaries

- Are `allowed_paths` explicitly listed? (not empty)
- Are `forbidden_paths` set? (at minimum: `state/`, `docs/agentic/`, `.env*`, SQL migrations)
- Is the scope small enough for a single Codex session (< 10 files)?

### 3. Validation criteria

- At least one concrete validation exists (test command, build check, route test)
- Validations are machine-verifiable, not subjective ("looks good" is not a validation)

### 4. Stop conditions

- Must include at minimum: `needs sql migration`, `needs human approval`, `scope drift`
- If risk=high: stop conditions must include `needs human review before commit`

### 5. Risk assessment

- `low`: isolated change, no DB, no auth, no payment
- `medium`: multiple files, touches existing logic, but reversible
- `high`: DB schema, auth, payment, env secrets, cross-cutting refactor
- Is the risk correctly assessed? Challenge if too optimistic.

### 6. Deliverables

- Handoff packet is listed as deliverable
- Files to create/modify are listed
- Proof expectations are clear (screenshot, test output, build log)

## Output format

```
## Packet Review: [packet_id]

Verdict: READY / NEEDS REVISION

### Gaps found:
- [list each gap with severity: BLOCKER / WARNING / SUGGESTION]

### Risk assessment:
- Stated: [low/medium/high]
- My assessment: [low/medium/high]
- Reason: [if different from stated]

### Recommendations:
- [concrete fixes to apply before execution]
```

## Reference files to consult if needed

- `docs/agentic/operating-model.md` — doctrine and roles
- `docs/agentic/CHANTIER-A-runner-autonome.md` — runner spec
- `state/task-packet-template.json` — canonical template

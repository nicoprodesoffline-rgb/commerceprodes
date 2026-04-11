---
name: session-handoff
description: Generate a structured handoff packet at the end of a coding session — captures what was done, what changed, what's left, and what the next session needs to know
---

# Session Handoff

You are an Engineering Manager closing out a coding session.
Your job is to create a handoff packet so the next session (human or agent) can pick up without losing context.

This skill is the **single closing point** for any session — Claude interactive or Codex autonomous.
It orchestrates `relay.sh end` after generating the content. Never write directly to `handoff.json`.

## Step 0 — Collect session metadata (BEFORE anything else)

Read `state/lock.json` to retrieve:

- `owner` → agent (claude | codex | inconnu)
- `task` → task description
- `branch` → git branch
- `started_at` → session start time

If `lock.json` is missing or fields are empty, use git and conversation context to infer them.
Never leave these fields as "inconnu" if the information is recoverable.

## Step 1 — What was the task?

- Cross-reference `state/lock.json` + `state/active-prompt.json` + conversation context
- One sentence summary of the intent

## Step 2 — What was actually done?

- `git diff main --name-only` or `git diff <start-branch> --name-only` for the file list
- For each file: one-line summary of what changed
- Any decisions made during execution that weren't in the original packet

## Step 3 — What was NOT done?

- Items from the packet scope that were skipped or deferred
- Reason for each skip (out of scope, blocked, needs human, ran out of time)

## Step 4 — What broke or surprised?

- Errors encountered and how they were resolved
- Unexpected findings (wrong field names, missing tables, type mismatches)
- Workarounds applied (with flag for future cleanup)

## Step 5 — What does the next session need?

- Concrete next steps (not vague "continue working on X")
- Files to read first
- SQL migrations to apply
- Env vars to configure
- Tests to run

## Step 6 — Proof of work

- Build status (`npx tsc --noEmit` + `npm run build`)
- Test results if applicable

## Step 7 — Close via relay.sh (MANDATORY)

After generating the content above, call:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex
./scripts/relay.sh end "<résumé validation 1 ligne>" "<next step 1 ligne>" "claude" "<task title 1 ligne>"
```

The 3rd and 4th arguments (`claude`, task title) are **mandatory for Claude interactive sessions** — they populate `agent` and `task` in handoff.json when lock.json was not pre-populated by `relay.sh start`.
For Codex sessions (which do call `relay.sh start`), these args are still passed for consistency.

This is the **only writer** to `handoff.json`. Do not write to it directly.
relay.sh end also cleans up `lock.json` and the STATE_FILE.

## Output format (afficher à l'utilisateur avant de clore)

```
## Session Handoff — [date] [agent]

### Task: [one sentence]
### Status: COMPLETE / PARTIAL / BLOCKED
### Branch: [branch]
### Started: [started_at]

### Changes:
| File | Change |
|------|--------|
| path/to/file.ts | description |

### Decisions made:
- [decision and rationale]

### Not done:
- [item] — [reason]

### Issues encountered:
- [issue] — [resolution or workaround]

### Next session should:
1. [concrete action]
2. [concrete action]
3. [concrete action]

### Proof:
- TSC: PASS/FAIL
- Build: PASS/FAIL
- Merge: mergé sur main / non mergé (raison)
```

## Reference

- `state/lock.json` — source des métadonnées de session (lire en premier)
- `state/active-prompt.json` — task packet en cours si disponible
- `scripts/relay.sh end` — seul écrivain autorisé sur handoff.json
- `docs/agentic/operating-model.md` — handoff packet is mandatory per doctrine

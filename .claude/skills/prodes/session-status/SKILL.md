---
name: session-status
description: Quick status dump of current project state — reads state/handoff.json and state/roadmap.json, reports last session result, emergency flag, and upcoming roadmap items.
---

# Session Status

Read and synthesize the current project state in under 30 seconds.

## Steps

1. Read `../state/handoff.json` (relative to commerce root: `/Users/nico/Desktop/prodes_newsite_codex/state/handoff.json`)

   - Extract: `last_session.agent`, `last_session.task`, `last_session.validation`, `last_session.next_step`, `last_session.emergency`

2. Read `../state/roadmap.json`

   - Filter: items with `status: "in_progress"` (all) + `status: "todo"` (first 5, ordered as-is)
   - Note any `blocked: true` flags

3. Read `../state/lock.json`
   - If `status !== "idle"`, a session is currently active — report who owns it

## Output format

```
## Session Status — [today's date]

### Last session
- Agent: [agent]
- Task: [task]
- Result: [validation — 1 line]
- Emergency close: YES ⚠️ / NO

### Next step
[next_step from handoff — verbatim]

### Active lock
[owner + task if lock.status !== idle, else "—"]

### Roadmap snapshot
| Status | Item |
|--------|------|
| in_progress | [item title] |
| todo | [item title] |
...
```

If `emergency === true`, lead with a prominent warning before the status block:

> ⚠️ EMERGENCY CLOSE détecté. Vérifier l'état du repo avant de travailler.

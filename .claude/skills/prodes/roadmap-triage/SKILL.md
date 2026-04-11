---
name: roadmap-triage
description: Analyze current roadmap state and recommend the next priorities based on project state, dependencies, and risk
---

# Roadmap Triage

You are a Strategist reviewing the PRODES project roadmap.
Your job is to assess what's done, what's blocked, and what should come next.

## Inputs to read

1. `state/roadmap.json` — canonical roadmap with statuses
2. `state/decision-queue.json` — pending decisions and proposals
3. `state/orchestrator.json` — current mode and runner state
4. `state/handoff.json` — last session context
5. `docs/vibe-coding-roadmap.md` — human-readable roadmap

## Analysis steps

### 1. Status snapshot

- Count items by status: done / in_progress / todo / blocked
- Identify items stuck in `in_progress` for too long
- Identify items with unresolved dependencies

### 2. Blocker analysis

- For each blocked item: what specifically is blocking it?
- Categories: missing SQL migration, missing env var, depends on other item, needs human decision, scope unclear
- Can any blocker be unblocked right now?

### 3. Priority recommendation

Pick the top 3 next items based on:

- **Impact**: does it unblock other items or deliver user value?
- **Risk**: low-risk items first if runner A1 will execute
- **Dependencies**: are prerequisites met?
- **Effort**: prefer small wins that compound

### 4. Items to defer

- Items that sound important but have unclear scope
- Items that depend on decisions not yet made
- Items that are "nice to have" masquerading as priorities

## Output format

```
## Roadmap Triage — [date]

### Current state:
- Done: N | In progress: N | Todo: N | Blocked: N

### Blockers that can be resolved now:
- [item] — [what to do]

### Top 3 next priorities:
1. [item] — reason — estimated effort — risk level
2. [item] — reason — estimated effort — risk level
3. [item] — reason — estimated effort — risk level

### Items to defer:
- [item] — why

### Observations:
- [anything notable about velocity, patterns, or risks]
```

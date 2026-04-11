# Task Completion Checklist

Before closing any session or task:

1. `npx tsc --noEmit` → must show **0 errors**
2. `npm run build` → must **succeed**
3. `npm run prettier` → format all modified files
4. Commit with atomic, scoped messages
5. Run `/session-handoff` skill (or `relay.sh end`) to generate the closing packet
6. Update `state/handoff.json` via relay.sh

## Quality bar (score ≥ 80/100)

- ✅ tsc: 0 errors
- ✅ build: success
- ✅ No regressions on critical admin routes (auth, checkout, devis)
- ✅ Complete closing packet (summary + done + remaining + restart_from)
- ✅ Atomic commits with clear messages

## Skills available (in `.claude/skills/prodes/`)

- `/roadmap-triage` — before starting a complex task
- `/packet-review` — before executing a task packet
- `/route-audit` — after modifying a route or page
- `/session-handoff` — **mandatory at end of every session**

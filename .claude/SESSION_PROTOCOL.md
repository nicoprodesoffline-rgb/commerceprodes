# Session Protocol

## Serena

If Serena MCP is available:
1. check connection
2. `activate_project` with `/Users/nico/Desktop/prodes_newsite_codex`
3. `initial_instructions`
4. `check_onboarding_performed`
5. `onboarding` only if missing

## When To Read Parent `state/*`

Read parent state files only when needed:
- resuming previous interrupted work
- deciding project priority across multiple tasks
- handling orchestration / handoff / emergency-close
- checking current autonomous/manual mode

Default order when state is needed:
1. `state/orchestrator.json`
2. `state/roadmap.json`
3. `state/handoff.json`

## Emergency-Close Check

If `state/handoff.json` shows `last_session.emergency === true`, surface it immediately before other work.

## Session Close

Use only:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex
./scripts/relay.sh end "<validation 1 line>" "<next step 1 line>" "codex" "<task title>"
```

Never write `handoff.json` directly.

## Weight Hints

- `W1` simple read/script
- `W2` standard implementation
- `W3` complex implementation/debug/refactor
- `W4` architecture or risky migration


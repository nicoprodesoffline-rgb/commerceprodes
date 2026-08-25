# CLAUDE.md

## Workspace

- App repo: `/Users/nico/Desktop/prodes_newsite_codex/commerce`
- Shared orchestrator root: `/Users/nico/Desktop/prodes_newsite_codex`
- Shared state: `/Users/nico/Desktop/prodes_newsite_codex/state`

## Startup Order

If Serena MCP is available:
1. connect to Serena
2. `activate_project` with `/Users/nico/Desktop/prodes_newsite_codex`
3. `initial_instructions`
4. `check_onboarding_performed`
5. `onboarding` only if missing

Then read this compact pack first:
1. `.claude/QUICK_START.md`
2. `.claude/ARCHITECTURE_MAP.md`
3. `.claude/CURRENT_PRIORITIES.md`
4. `.claude/COMMON_MISTAKES.md`

Read parent `state/*` only when needed:
- resuming a previous interrupted session
- handling orchestration / handoff / emergency-close
- project priority is unclear without cross-session state

Detailed protocol lives in `.claude/SESSION_PROTOCOL.md`.

## Engineering References

- `AGENTS.md` for project-specific engineering rules
- `.claude/rules/tooling.md` for Claude tooling rules
- `.claude/SESSION_PROTOCOL.md` for Serena, state, emergency-close, and session-close behavior

## Critical Reminders

- DB access via `lib/supabase/index.ts`
- Product images via `product_images`
- B2B product pages: no generic "Add to Cart"
- Proof-of-work target: `npm run build && npx tsc --noEmit`
- If Serena is unavailable, continue without blocking the session


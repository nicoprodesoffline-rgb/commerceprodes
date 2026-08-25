# Quick Start

- App repo: `/Users/nico/Desktop/prodes_newsite_codex/commerce`
- Shared orchestrator root: `/Users/nico/Desktop/prodes_newsite_codex`
- Core proof-of-work:
  - `npm run build`
  - `npx tsc --noEmit`
- Targeted lint:
  - `npx eslint app lib components`
- Session close:
  - `cd /Users/nico/Desktop/prodes_newsite_codex && ./scripts/relay.sh end "<validation>" "<next step>" "codex" "<task title>"`
- If `tsc` complains about missing `.next/types`, run `npm run build` first, then rerun `npx tsc --noEmit`.


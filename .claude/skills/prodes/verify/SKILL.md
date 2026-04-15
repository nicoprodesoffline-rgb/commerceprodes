---
name: verify
description: Run the official proof-of-work verification — TypeScript check + full Next.js build. Use before closing a session or after significant changes. Both must pass; TSC alone is insufficient.
---

# Verify

Run the official proof-of-work as defined in `AGENTS.md`:

```bash
cd /Users/nico/Desktop/prodes_newsite_codex/commerce
npx tsc --noEmit && npm run build
```

## Report

Output a compact result:

```
## Proof-of-work — [date]

- TSC:   PASS / FAIL ([N] errors)
- Build: PASS / FAIL

[If FAIL: first 3 errors with file:line]
```

## Rules

- Both must pass (exit 0). If either fails, report what's broken and stop — do not mark the task complete.
- If TSC fails but build passes, still report as FAIL (TSC is part of the contract).
- If there are type errors in auto-generated files (e.g., `.next/`), note them separately — they don't block the gate.

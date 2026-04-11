# Suggested Commands

## Development

```bash
cd /Users/nico/Desktop/prodes_newsite_codex/commerce

npm run dev          # Next.js dev server with Turbopack
npm run build        # Production build
npm run start        # Start production server
```

## Quality checks (run before closing a session)

```bash
npx tsc --noEmit     # TypeScript — must show 0 errors
npm run build        # Full build — must succeed
npm run prettier     # Auto-format all files
npm run prettier:check  # Check formatting (used as "test" script)
```

## Orchestration helpers

```bash
cd /Users/nico/Desktop/prodes_newsite_codex
./scripts/relay.sh start codex "<task title>"
./scripts/relay.sh end "tsc: 0 erreur, build: OK, <summary>" "next: <next step>"
./scripts/relay.sh emergency-close "<reason>" "<instructions>"
./scripts/relay.sh idea-done <idea-id>
```

## Git

```bash
git add <specific files>   # Never use git add -A / git add .
git commit -m "feat(scope): description"
# Never --no-verify, never --force-push
```

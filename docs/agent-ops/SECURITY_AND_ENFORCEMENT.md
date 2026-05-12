# Security And Enforcement

Prompt rules are advisory. Security-sensitive behavior must be enforced through denied paths, dummy test values, secret scanning, and explicit approvals.

## Secret Handling

Agents must not read, print, summarize, write, commit, or copy:

- `.env*`
- `.vercel`
- private keys
- credentials directories
- production database URLs
- API tokens
- customer data exports unless explicitly scoped

Use `.env.example` or dummy values for documentation and testing.

## Local Settings

The ignored local file `.claude/settings.local.json` should deny secret and destructive access. The tracked reference copy is:

- `docs/agent-ops/claude-settings.local.example.json`

## Runtime Output Leaks

Commands can leak secrets through logs even if files are blocked. Avoid verbose modes that print headers, tokens, database URLs, or Vercel env output.

## Secret Scan

Use:

```bash
scripts/agent_ops/pre-commit-secret-scan.sh
```

The scanner checks staged changes. It is intentionally conservative.

## Explicit Approval Required

- production deploys
- SQL migrations applied to live databases
- Vercel env pull or env changes
- changing `.env.example` semantics
- auth or checkout changes with production impact
- destructive git commands

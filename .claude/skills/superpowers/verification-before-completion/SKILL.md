---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim                 | Requires                            | Not Sufficient               |
| --------------------- | ----------------------------------- | ---------------------------- |
| Tests pass            | Test command output: 0 failures     | Previous run, "should pass"  |
| TypeScript clean      | `npx tsc --noEmit` output: 0 errors | Linter passing, "looks fine" |
| Build succeeds        | `npm run build` exit 0              | TSC passing, logs look good  |
| Bug fixed             | Test original symptom: passes       | Code changed, assumed fixed  |
| Regression test works | Red-green cycle verified            | Test passes once             |
| Agent completed       | VCS diff shows changes              | Agent reports "success"      |
| Requirements met      | Line-by-line checklist              | Tests passing                |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports without checking
- Relying on partial verification
- Thinking "just this once"
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse                                  | Reality                |
| --------------------------------------- | ---------------------- |
| "Should work now"                       | RUN the verification   |
| "I'm confident"                         | Confidence ≠ evidence  |
| "Just this once"                        | No exceptions          |
| "TSC passed"                            | TSC ≠ build            |
| "Agent said success"                    | Verify independently   |
| "Partial check is enough"               | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter     |

## Key Patterns

**TypeScript + Build (PRODES standard):**

```bash
npx tsc --noEmit && npm run build
```

✅ "TSC: 0 errors. Build: exit 0. Done."
❌ "Should compile fine" / "Looks correct"

**Tests:**

```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**

```
✅ Write → Run (MUST FAIL) → Implement → Run (MUST PASS)
❌ "I've written a regression test" (without red-green verification)
```

**Requirements:**

```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**

```
✅ Agent reports success → Check git diff → Verify changes → Report actual state
❌ Trust agent report
```

## When To Apply

**ALWAYS before:**

- ANY variation of success/completion claims
- ANY expression of satisfaction
- Committing, PR creation, task completion
- Moving to next task
- Invoking `session-handoff`

**Rule applies to:**

- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.

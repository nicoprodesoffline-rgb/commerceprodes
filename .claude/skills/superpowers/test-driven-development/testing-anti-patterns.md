# Testing Anti-Patterns

**Load this reference when:** writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

## Overview

Tests must verify real behavior, not mock behavior. Mocks are a means to isolate, not the thing being tested.

**Core principle:** Test what the code does, not what the mocks do.

**Following strict TDD prevents these anti-patterns.**

## The Iron Laws

```
1. NEVER test mock behavior
2. NEVER add test-only methods to production classes
3. NEVER mock without understanding dependencies
```

## Anti-Pattern 1: Testing Mock Behavior

**Bad:**

```tsx
// Test asserts on the mock's test ID, not the real component
expect(screen.getByTestId("sidebar-mock")).toBeInTheDocument();
```

**Good:**

```tsx
// Assert on real accessible role or content
expect(screen.getByRole("navigation")).toBeInTheDocument();
// Or: don't mock the sidebar at all if it's cheap to render
```

**Gate function:** Before asserting on any mock element, ask: "Am I testing real component behavior or just mock existence?" If the latter — stop, delete the assertion or unmock.

## Anti-Pattern 2: Test-Only Methods in Production

**Bad:**

```ts
// Session class in production code
class Session {
  destroy() {
    /* only called in tests */
  }
}
```

**Good:**

```ts
// Move to test utilities
// test-utils/session.ts
export function destroySession(session: Session) { ... }
```

**Gate function:** Before adding any method to a production class, ask: "Is this only used by tests?" If yes — don't add it. Put it in test utilities instead.

## Anti-Pattern 3: Mocking Without Understanding

**Bad:**

```ts
// Mocked discoverAndCacheTools, but the test depended on its side effects
jest.mock("./tools", () => ({ discoverAndCacheTools: jest.fn() }));
// Test breaks because mock skipped a cache-population side effect
```

**Good:**

```ts
// Mock at the lowest necessary level, preserving needed behavior
jest.mock("./tools/fetch", () => ({
  fetchTool: jest.fn().mockResolvedValue(mockTool),
}));
// discoverAndCacheTools still runs, cache still gets populated
```

**Gate function:** Before mocking any method — stop, understand all side effects, check whether test depends on them, mock at lowest necessary level.

## Anti-Pattern 4: Incomplete Mocks

**The Iron Rule:** Mock the COMPLETE data structure as it exists in reality, not just fields your immediate test uses.

**Bad:**

```ts
const mockResponse = { data: { price: 100 } }; // missing metadata field
// Test passes but breaks when production code accesses metadata
```

**Good:**

```ts
const mockResponse = {
  data: { price: 100 },
  metadata: { currency: "EUR", valid_from: "2026-01-01" },
  // All fields the real API returns
};
```

**Gate function:** Before creating mock responses, check what fields the real API/function returns and include ALL of them.

## Anti-Pattern 5: Integration Tests as Afterthought

Testing is part of implementation, not optional follow-up. TDD cycle must be followed.

If you're adding tests after writing the code, you're not doing TDD — and you're probably testing "what the code does" rather than "what it should do."

## When Mocks Become Too Complex

Warning signs:

- Mock setup is longer than the test logic
- You're mocking everything in the module
- Mocks are missing methods the real components have
- You can't explain why you need a mock

Consider integration tests with real components instead.

## TDD Prevents These Anti-Patterns

1. Write test first → forces thinking about what you're actually testing
2. Watch it fail → confirms test tests real behavior, not mocks
3. Minimal implementation → no test-only methods creep in
4. Real dependencies visible → you see what the test actually needs before mocking

**If you're testing mock behavior, you violated TDD.**

## Quick Reference

| Anti-Pattern                    | Fix                                           |
| ------------------------------- | --------------------------------------------- |
| Assert on mock elements         | Test real component or unmock it              |
| Test-only methods in production | Move to test utilities                        |
| Mock without understanding      | Understand dependencies first, mock minimally |
| Incomplete mocks                | Mirror real API completely                    |
| Tests as afterthought           | TDD — tests first                             |
| Over-complex mocks              | Consider integration tests                    |

## Red Flags

- Assertion checks for `*-mock` test IDs
- Methods only called in test files
- Mock setup is >50% of test
- Test fails when you remove mock
- Can't explain why mock is needed
- Mocking "just to be safe"

## The Bottom Line

**Mocks are tools to isolate, not things to test.**

If TDD reveals you're testing mock behavior, you've gone wrong.

Fix: Test real behavior or question why you're mocking at all.

# Commerce Startup Context Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce startup context overhead in `commerce` by replacing a bulky default read path with a compact `.claude/*` pack and a smaller root `CLAUDE.md`.

**Architecture:** Keep the existing repo rules and orchestration behavior, but move detailed startup/session mechanics into focused files. Root `CLAUDE.md` becomes an entrypoint that loads compact docs first and reads parent `state/*` only when needed.

**Tech Stack:** Markdown docs, Claude/Codex repo instructions, `.claudeignore`

---

### Task 1: Create compact startup pack

**Files:**
- Create: `.claude/QUICK_START.md`
- Create: `.claude/ARCHITECTURE_MAP.md`
- Create: `.claude/CURRENT_PRIORITIES.md`
- Create: `.claude/COMMON_MISTAKES.md`
- Create: `.claude/SESSION_PROTOCOL.md`

- [ ] **Step 1: Write concise content**
- [ ] **Step 2: Keep each file focused and short**
- [ ] **Step 3: Verify overlap is minimal**

### Task 2: Convert `CLAUDE.md` into a compact entrypoint

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Keep workspace and critical references**
- [ ] **Step 2: Point startup to `.claude/*`**
- [ ] **Step 3: Make parent `state/*` reads conditional**

### Task 3: Limit incidental auto-loading

**Files:**
- Create: `.claudeignore`

- [ ] **Step 1: Exclude bulky historical and archival docs**
- [ ] **Step 2: Avoid excluding files needed for normal coding**

### Task 4: Record pilot outcome

**Files:**
- Create: `docs/agent-ops/2026-04-21-startup-context-pilot.md`

- [ ] **Step 1: Capture rationale**
- [ ] **Step 2: Record before/after measurement direction**
- [ ] **Step 3: Document rollback path**


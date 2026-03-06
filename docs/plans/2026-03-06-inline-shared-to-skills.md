# Inline shared/ Into Self-Contained Skills

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate `skills/shared/` by inlining all code into each skill's `scripts/` directory, making every skill self-contained and independently deployable.

**Architecture:** Copy shared source + test files flat into each skill's `scripts/`. Rename `x-runtime/types.ts` → `x-types.ts` to avoid conflict with skill-local `types.ts`. Fix all import paths. Delete `shared/`.

**Tech Stack:** Bun, TypeScript

---

### Task 1: Copy shared files into x-bookmarks/scripts/

**Files:**
- Copy: all `skills/shared/*.ts` and `skills/shared/x-runtime/*.ts` → `skills/x-bookmarks/scripts/`

**Step 1: Copy root shared files**

```bash
cp skills/shared/arg-parser.ts skills/shared/arg-parser.test.ts \
   skills/shared/openai-format.ts skills/shared/openai-format.test.ts \
   skills/shared/retry.ts skills/shared/retry.test.ts \
   skills/shared/wqq-skills-env.ts skills/shared/wqq-skills-env.test.ts \
   skills/x-bookmarks/scripts/
```

**Step 2: Copy x-runtime files (rename types.ts → x-types.ts)**

```bash
# Copy all x-runtime files except types.ts and index.ts
cp skills/shared/x-runtime/chrome-login.ts \
   skills/shared/x-runtime/chrome-login.test.ts \
   skills/shared/x-runtime/constants.ts \
   skills/shared/x-runtime/cookie-store.ts \
   skills/shared/x-runtime/cookie-store.test.ts \
   skills/shared/x-runtime/cookies.ts \
   skills/shared/x-runtime/cookies.test.ts \
   skills/shared/x-runtime/fxtwitter.ts \
   skills/shared/x-runtime/fxtwitter.test.ts \
   skills/shared/x-runtime/graphql.ts \
   skills/shared/x-runtime/graphql.test.ts \
   skills/shared/x-runtime/http.ts \
   skills/shared/x-runtime/http.test.ts \
   skills/shared/x-runtime/markdown.ts \
   skills/shared/x-runtime/markdown.test.ts \
   skills/shared/x-runtime/media-localizer.ts \
   skills/shared/x-runtime/output.ts \
   skills/shared/x-runtime/output.test.ts \
   skills/shared/x-runtime/paths.ts \
   skills/shared/x-runtime/paths.test.ts \
   skills/shared/x-runtime/thread-markdown.ts \
   skills/shared/x-runtime/thread-markdown.test.ts \
   skills/shared/x-runtime/thread.ts \
   skills/shared/x-runtime/tweet-article.ts \
   skills/shared/x-runtime/tweet-to-markdown.ts \
   skills/shared/x-runtime/tweet-utils.ts \
   skills/shared/x-runtime/tweet-utils.test.ts \
   skills/shared/x-runtime/url-utils.ts \
   skills/shared/x-runtime/url-utils.test.ts \
   skills/x-bookmarks/scripts/

# Copy types.ts as x-types.ts
cp skills/shared/x-runtime/types.ts skills/x-bookmarks/scripts/x-types.ts
```

**Do NOT copy:** `skills/shared/x-runtime/index.ts` (barrel export, no longer needed)

---

### Task 2: Fix imports in x-bookmarks/scripts/

**Files:**
- Modify: all `.ts` files in `skills/x-bookmarks/scripts/`

**Import rewrite rules (apply in order):**

1. **Shared x-runtime types → x-types** (in copied shared files):
   All former x-runtime files that had `from "./types"` must change to `from "./x-types"`.
   Affected files: `chrome-login.ts`, `cookie-store.ts`, `cookies.ts`, `fxtwitter.ts`, `graphql.ts`, `http.ts`, `markdown.ts`, `thread.ts`, `tweet-article.ts`, `tweet-to-markdown.ts`, `tweet-utils.ts`

2. **graphql.ts parent import** (the only cross-level import within shared):
   `from "../retry"` → `from "./retry"`

3. **Skill files — x-runtime imports**:
   `from "../../shared/x-runtime/foo"` → `from "./foo"`
   Exception: `from "../../shared/x-runtime/types"` → `from "./x-types"`

4. **Skill files — root shared imports**:
   `from "../../shared/foo"` → `from "./foo"`

**Step 1: Fix `"./types"` → `"./x-types"` in copied shared files**

In each of the 11 files listed above, replace `from "./types"` with `from "./x-types"`.

**Step 2: Fix graphql.ts parent import**

In `graphql.ts`, replace `from "../retry"` with `from "./retry"`.

**Step 3: Fix skill file imports**

Files to modify and their import changes:

- `main.ts`:
  - `../../shared/x-runtime/cookies` → `./cookies`
  - `../../shared/x-runtime/media-localizer` → `./media-localizer`
  - `../../shared/x-runtime/tweet-to-markdown` → `./tweet-to-markdown`
  - `../../shared/wqq-skills-env` → `./wqq-skills-env`
  - `../../shared/arg-parser` → `./arg-parser`
  - `../../shared/retry` → `./retry`
  - `../../shared/x-runtime/output` → `./output`
  - `../../shared/x-runtime/types` → `./x-types`

- `bookmarks-api.ts`:
  - `../../shared/x-runtime/constants` → `./constants`
  - `../../shared/x-runtime/http` → `./http`
  - `../../shared/retry` → `./retry`
  - `../../shared/x-runtime/types` → `./x-types`

- `bookmarks-parser.ts`:
  - `../../shared/x-runtime/types` → `./x-types`
  - `../../shared/x-runtime/tweet-utils` → `./tweet-utils`

- `debug.ts`:
  - `../../shared/x-runtime/cookies` → `./cookies`
  - `../../shared/arg-parser` → `./arg-parser`

- `tweet-detail.ts`:
  - `../../shared/x-runtime/constants` → `./constants`
  - `../../shared/x-runtime/http` → `./http`
  - `../../shared/x-runtime/types` → `./x-types`
  - `../../shared/x-runtime/tweet-utils` → `./tweet-utils`

- `summary.ts`:
  - `../../shared/openai-format` → `./openai-format`
  - `../../shared/wqq-skills-env` → `./wqq-skills-env`

**Step 4: Run typecheck**

Run: `npx -y bun run typecheck`
Expected: PASS

**Step 5: Run tests**

Run: `npx -y bun test skills/x-bookmarks/`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add skills/x-bookmarks/scripts/
git commit -m "refactor(x-bookmarks): inline shared/ files into scripts/"
```

---

### Task 3: Copy shared files into x-to-md/scripts/

**Files:**
- Copy: all `skills/shared/*.ts` and `skills/shared/x-runtime/*.ts` → `skills/x-to-md/scripts/`

Same procedure as Task 1 — copy all shared source + test files into `skills/x-to-md/scripts/`, rename `types.ts` → `x-types.ts`, skip `index.ts`.

---

### Task 4: Fix imports in x-to-md/scripts/

**Files:**
- Modify: all `.ts` files in `skills/x-to-md/scripts/`

Same rewrite rules as Task 2. Skill-specific changes:

- `main.ts`:
  - `../../shared/x-runtime/fxtwitter` → `./fxtwitter`
  - `../../shared/x-runtime/media-localizer` → `./media-localizer`
  - `../../shared/wqq-skills-env` → `./wqq-skills-env`
  - `../../shared/x-runtime/url-utils` → `./url-utils`
  - `../../shared/arg-parser` → `./arg-parser`
  - `../../shared/x-runtime/output` → `./output`

- `summarize.ts`:
  - `../../shared/openai-format` → `./openai-format`
  - `../../shared/wqq-skills-env` → `./wqq-skills-env`

Plus the same shared-internal fixes (11 files `./types` → `./x-types`, graphql.ts `../retry` → `./retry`).

**Step 4: Run typecheck**

Run: `npx -y bun run typecheck`
Expected: PASS

**Step 5: Run tests**

Run: `npx -y bun test skills/x-to-md/`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add skills/x-to-md/scripts/
git commit -m "refactor(x-to-md): inline shared/ files into scripts/"
```

---

### Task 5: Delete shared/ and update docs

**Files:**
- Delete: `skills/shared/` (entire directory)
- Modify: `CLAUDE.md`

**Step 1: Run full test suite before deletion**

Run: `npx -y bun run typecheck && npx -y bun run test`
Expected: ALL PASS

**Step 2: Delete shared/**

```bash
rm -rf skills/shared/
```

**Step 3: Run typecheck + tests again**

Run: `npx -y bun run typecheck && npx -y bun run test`
Expected: ALL PASS (no file should reference shared/ anymore)

**Step 4: Update CLAUDE.md project structure**

Replace the project structure section to remove `shared/` and reflect the new self-contained layout:

```markdown
### 项目结构

\```
skills/
  x-bookmarks/         # 导出 X 书签为 Markdown（自包含）
    scripts/            # 所有源码 + x-runtime 模块
    SKILL.md
  x-to-md/             # 将 X 链接转为 Markdown（自包含）
    scripts/            # 所有源码 + x-runtime 模块
    SKILL.md
\```
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove shared/ directory, skills are now self-contained"
```

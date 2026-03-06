# Bookmarks Batch Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add throttled batch export with dedup state file and resume support to x-bookmarks.

**Architecture:** Add a `state.ts` module managing `exported-ids.json` (persisted set of exported tweet IDs + last cursor). Modify `main.ts` to support `--all` flag, throttle delays between API calls, and read/write state on each export. Reduce bookmark page size from 50 to 20.

**Tech Stack:** Bun, TypeScript, node:fs/promises

---

### Task 1: Add ExportState type and `--all` to ExportArgs

**Files:**
- Modify: `skills/x-bookmarks/scripts/types.ts`

**Step 1: Add types**

```typescript
// Append to existing types.ts

export type ExportState = {
  exportedIds: string[];
  lastCursor: string | null;
  lastRunAt: string;
};

// No change to ExportArgs yet — that happens in Task 3
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/x-bookmarks/scripts/types.ts
git commit -m "feat(x-bookmarks): add ExportState type"
```

---

### Task 2: Create state.ts — read/write/update exported-ids.json

**Files:**
- Create: `skills/x-bookmarks/scripts/state.ts`
- Create: `skills/x-bookmarks/scripts/state.test.ts`

**Step 1: Write failing tests**

```typescript
// state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadExportState, saveExportState, isExported, addExportedId } from "./state";

describe("state", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "state-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty state when file does not exist", async () => {
    const state = await loadExportState(dir);
    expect(state.exportedIds).toEqual([]);
    expect(state.lastCursor).toBeNull();
  });

  it("round-trips state to JSON file", async () => {
    const state = { exportedIds: ["111", "222"], lastCursor: "abc", lastRunAt: "2026-03-06T00:00:00Z" };
    await saveExportState(dir, state);

    const loaded = await loadExportState(dir);
    expect(loaded.exportedIds).toEqual(["111", "222"]);
    expect(loaded.lastCursor).toBe("abc");
  });

  it("isExported checks set membership", async () => {
    const state = { exportedIds: ["111", "222"], lastCursor: null, lastRunAt: "" };
    expect(isExported(state, "111")).toBe(true);
    expect(isExported(state, "999")).toBe(false);
  });

  it("addExportedId appends without duplicates", () => {
    const state = { exportedIds: ["111"], lastCursor: null, lastRunAt: "" };
    addExportedId(state, "222");
    addExportedId(state, "111"); // duplicate
    expect(state.exportedIds).toEqual(["111", "222"]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test skills/x-bookmarks/scripts/state.test.ts`
Expected: FAIL — module not found

**Step 3: Implement state.ts**

```typescript
// state.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ExportState } from "./types";

const STATE_FILENAME = "exported-ids.json";

function emptyState(): ExportState {
  return { exportedIds: [], lastCursor: null, lastRunAt: "" };
}

export async function loadExportState(outputDir: string): Promise<ExportState> {
  try {
    const raw = await readFile(path.join(outputDir, STATE_FILENAME), "utf8");
    const parsed = JSON.parse(raw);
    return {
      exportedIds: Array.isArray(parsed.exportedIds) ? parsed.exportedIds : [],
      lastCursor: typeof parsed.lastCursor === "string" ? parsed.lastCursor : null,
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : "",
    };
  } catch {
    return emptyState();
  }
}

export async function saveExportState(outputDir: string, state: ExportState): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, STATE_FILENAME);
  await writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function isExported(state: ExportState, tweetId: string): boolean {
  return state.exportedIds.includes(tweetId);
}

export function addExportedId(state: ExportState, tweetId: string): void {
  if (!state.exportedIds.includes(tweetId)) {
    state.exportedIds.push(tweetId);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test skills/x-bookmarks/scripts/state.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/x-bookmarks/scripts/state.ts skills/x-bookmarks/scripts/state.test.ts
git commit -m "feat(x-bookmarks): add state file for dedup and resume"
```

---

### Task 3: Add throttle utility — sleep with random jitter

**Files:**
- Modify: `skills/shared/retry.ts`

**Step 1: Add sleepWithJitter function**

Append to existing `skills/shared/retry.ts`:

```typescript
export function sleepWithJitter(baseMs: number, jitterMs: number): Promise<void> {
  const delay = baseMs + Math.random() * jitterMs;
  return sleep(delay);
}
```

Note: `sleep` is already defined in retry.ts but not exported. Export it too.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/shared/retry.ts
git commit -m "feat(shared): add sleepWithJitter utility"
```

---

### Task 4: Modify main.ts — add --all, throttle, state file integration

**Files:**
- Modify: `skills/x-bookmarks/scripts/types.ts` (add `all` field to ExportArgs)
- Modify: `skills/x-bookmarks/scripts/main.ts`

**Step 1: Update ExportArgs type**

Add `all: boolean` field to `ExportArgs` in types.ts.

**Step 2: Update parseExportArgs**

In main.ts, add `--all` flag handler:
- Default `all: false`
- When `--all` is true, set `limit` to `Infinity`

**Step 3: Modify collectBookmarkTweets**

Changes:
- Accept optional `startCursor` parameter (from state file)
- Reduce default page size from 50 to **20**
- Add **3 second** delay between page fetches using `sleepWithJitter(2000, 2000)` (2-4s)
- Log progress: `[bookmarks-export] page N: collected X ids so far`

```typescript
async function collectBookmarkTweets(
  cookieMap: XCookieMap,
  limit: number,
  log: (message: string) => void,
  startCursor?: string,
): Promise<{ tweetIds: string[]; tweetsById: Record<string, BookmarkTweet>; lastCursor: string | null }> {
  // ... existing logic but:
  // - page size = Math.min(20, remaining)
  // - initial cursor = startCursor
  // - sleepWithJitter(2000, 2000) between pages
  // - return lastCursor in result
}
```

**Step 4: Modify runBookmarksExport**

Changes:
1. Load state file at start via `loadExportState(args.outputDir)`
2. Pass `state.lastCursor` to `collectBookmarkTweets` when `--all`
3. Before exporting each tweet, check `isExported(state, tweetId)` — skip if true
4. After each successful export, call `addExportedId(state, tweetId)` and `saveExportState()`
5. Add `sleepWithJitter(3000, 2000)` (3-5s) between tweet exports
6. Update `state.lastCursor` after collection phase
7. Save state with `lastRunAt` timestamp at the end

Key logic in export loop:
```typescript
for (const tweetId of collected.tweetIds) {
  if (isExported(state, tweetId)) {
    log(`[bookmarks-export] skipped (state): ${tweetId}`);
    summary.skipped += 1;
    continue;
  }

  // Also check filesystem (backwards compat with pre-state exports)
  const existingPath = findExistingTweetMarkdownPath(args.outputDir, tweetId);
  if (existingPath) {
    addExportedId(state, tweetId);
    await saveExportState(args.outputDir, state);
    summary.skipped += 1;
    continue;
  }

  // Export tweet...
  // On success: addExportedId + saveExportState
  // Throttle before next
  await sleepWithJitter(3000, 2000);
}
```

**Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 6: Run existing tests**

Run: `bun test skills/x-bookmarks/`
Expected: PASS (existing tests should not break)

**Step 7: Commit**

```bash
git add skills/x-bookmarks/scripts/types.ts skills/x-bookmarks/scripts/main.ts
git commit -m "feat(x-bookmarks): add --all flag with throttle and state-based dedup"
```

---

### Task 5: Increase retry backoff for 429

**Files:**
- Modify: `skills/x-bookmarks/scripts/bookmarks-api.ts`

**Step 1: Increase retry delay for rate limits**

Change `retryWithBackoff` call in `fetchBookmarksPage`:

```typescript
export async function fetchBookmarksPage(params: FetchBookmarksPageParams): Promise<unknown> {
  return retryWithBackoff(() => fetchBookmarksPageOnce(params), {
    maxAttempts: 5,
    delayMs: 10_000,
    backoffFactor: 3,
    isRetryable: (err) => err instanceof HttpStatusError && (err.status === 429 || err.status >= 500),
    onRetry: (err, attempt) => {
      console.log(`[bookmarks-api] retry ${attempt}: ${err.message}`);
    },
  });
}
```

This gives: 10s → 30s → 90s → 270s backoff on 429.

**Step 2: Run typecheck and tests**

Run: `bun run typecheck && bun test skills/x-bookmarks/`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/x-bookmarks/scripts/bookmarks-api.ts
git commit -m "feat(x-bookmarks): increase retry backoff for rate limits"
```

---

### Task 6: Update SKILL.md documentation

**Files:**
- Modify: `skills/x-bookmarks/SKILL.md`

**Step 1: Add --all usage to SKILL.md**

Add to the "常用参数" section:

```markdown
# 拉取全部书签（带节流，自动去重，支持断点续传）
npx -y bun skills/x-bookmarks/scripts/main.ts --all

# 全部书签，不下载媒体
npx -y bun skills/x-bookmarks/scripts/main.ts --all --no-download-media
```

Add a new section explaining the state file:

```markdown
## 断点续传

脚本在 output 目录维护 `exported-ids.json` 状态文件，记录已导出的 tweet ID 和上次分页 cursor。
- 中断后重跑自动跳过已导出内容，从上次位置继续
- 如需完全重新导出，删除 `exported-ids.json` 即可
```

**Step 2: Commit**

```bash
git add skills/x-bookmarks/SKILL.md
git commit -m "docs(x-bookmarks): add --all and resume documentation"
```

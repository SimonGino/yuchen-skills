# Codebase Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate duplicated code, unify shared utilities, add core types, fix stale references, add missing tests, and add barrel exports.

**Architecture:** Bottom-up approach — stabilize shared modules first (dedup, types, tool unification), then fix small issues, then lock down final behavior with tests, and finally add structural improvements.

**Tech Stack:** TypeScript, Bun runtime, bun:test

---

### Task 1: Create `shared/x-runtime/tweet-utils.ts` with deduplicated functions

**Files:**
- Create: `skills/shared/x-runtime/tweet-utils.ts`
- Test: `skills/shared/x-runtime/tweet-utils.test.ts`

**Step 1: Write the test file**

```ts
import { describe, it, expect } from "bun:test";
import {
  unwrapTweetResult,
  pickTweetText,
  pickUsername,
  pickMediaUrls,
  formatMetaMarkdown,
  expandTcoUrls,
} from "./tweet-utils";

describe("unwrapTweetResult", () => {
  it("should return null for falsy input", () => {
    expect(unwrapTweetResult(null)).toBeNull();
    expect(unwrapTweetResult(undefined)).toBeNull();
  });

  it("should unwrap TweetWithVisibilityResults", () => {
    const result = {
      __typename: "TweetWithVisibilityResults",
      tweet: { rest_id: "123" },
    };
    expect(unwrapTweetResult(result)).toEqual({ rest_id: "123" });
  });

  it("should unwrap .tweet property as fallback", () => {
    const result = { tweet: { rest_id: "456" } };
    expect(unwrapTweetResult(result)).toEqual({ rest_id: "456" });
  });

  it("should return result as-is when no .tweet property", () => {
    const result = { rest_id: "789" };
    expect(unwrapTweetResult(result)).toEqual({ rest_id: "789" });
  });
});

describe("expandTcoUrls", () => {
  it("should expand t.co URLs using legacy entities", () => {
    const text = "Check https://t.co/abc123";
    const tweet = {
      legacy: {
        entities: {
          urls: [{ url: "https://t.co/abc123", expanded_url: "https://example.com/full" }],
        },
      },
    };
    expect(expandTcoUrls(text, tweet)).toBe("Check https://example.com/full");
  });

  it("should return text unchanged when no urls", () => {
    expect(expandTcoUrls("hello", {})).toBe("hello");
    expect(expandTcoUrls("hello", null)).toBe("hello");
  });
});

describe("pickTweetText", () => {
  it("should prefer note_tweet text", () => {
    const tweet = {
      note_tweet: { note_tweet_results: { result: { text: "note text" } } },
      legacy: { full_text: "legacy text" },
    };
    expect(pickTweetText(tweet)).toBe("note text");
  });

  it("should fall back to legacy full_text", () => {
    const tweet = { legacy: { full_text: "legacy text" } };
    expect(pickTweetText(tweet)).toBe("legacy text");
  });

  it("should expand t.co URLs in the result", () => {
    const tweet = {
      legacy: {
        full_text: "See https://t.co/x",
        entities: { urls: [{ url: "https://t.co/x", expanded_url: "https://real.com" }] },
      },
    };
    expect(pickTweetText(tweet)).toBe("See https://real.com");
  });

  it("should return empty string for null tweet", () => {
    expect(pickTweetText(null)).toBe("");
  });
});

describe("pickUsername", () => {
  it("should extract screen_name from core.user_results", () => {
    const tweet = { core: { user_results: { result: { legacy: { screen_name: "alice" } } } } };
    expect(pickUsername(tweet)).toBe("alice");
  });

  it("should return null when missing", () => {
    expect(pickUsername({})).toBeNull();
    expect(pickUsername(null)).toBeNull();
  });
});

describe("pickMediaUrls", () => {
  it("should extract photo URLs", () => {
    const tweet = {
      legacy: {
        extended_entities: {
          media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/img.jpg" }],
        },
      },
    };
    expect(pickMediaUrls(tweet)).toEqual(["https://pbs.twimg.com/img.jpg"]);
  });

  it("should extract best video URL by bitrate", () => {
    const tweet = {
      legacy: {
        extended_entities: {
          media: [{
            type: "video",
            video_info: {
              variants: [
                { url: "https://v.com/low.mp4", content_type: "video/mp4", bitrate: 100 },
                { url: "https://v.com/high.mp4", content_type: "video/mp4", bitrate: 2000 },
              ],
            },
          }],
        },
      },
    };
    expect(pickMediaUrls(tweet)).toEqual(["https://v.com/high.mp4"]);
  });

  it("should return empty array for null tweet", () => {
    expect(pickMediaUrls(null)).toEqual([]);
  });
});

describe("formatMetaMarkdown", () => {
  it("should format frontmatter with string and number values", () => {
    const result = formatMetaMarkdown({ url: "https://x.com/test", count: 5 });
    expect(result).toBe('---\nurl: "https://x.com/test"\ncount: 5\n---');
  });

  it("should skip null, undefined, and empty string values", () => {
    const result = formatMetaMarkdown({ a: "ok", b: null, c: undefined, d: "" });
    expect(result).toBe('---\na: "ok"\n---');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test skills/shared/x-runtime/tweet-utils.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
export function unwrapTweetResult(result: any): any {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) {
    return result.tweet;
  }
  return result?.tweet ?? result;
}

export function expandTcoUrls(text: string, tweet: any): string {
  const urls = tweet?.legacy?.entities?.urls;
  if (!Array.isArray(urls) || !text) {
    return text;
  }

  let expanded = text;
  for (const item of urls) {
    const shortUrl = item?.url;
    const expandedUrl = item?.expanded_url ?? item?.unwound_url;
    if (!shortUrl || !expandedUrl) {
      continue;
    }
    expanded = expanded.split(String(shortUrl)).join(String(expandedUrl));
  }
  return expanded;
}

export function pickTweetText(tweet: any): string {
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const legacyText = tweet?.legacy?.full_text ?? tweet?.legacy?.text ?? "";
  return expandTcoUrls(String(noteText ?? legacyText ?? "").trim(), tweet).trim();
}

export function pickUsername(tweet: any): string | null {
  const username = tweet?.core?.user_results?.result?.legacy?.screen_name;
  return username ? String(username).trim() : null;
}

export function pickMediaUrls(tweet: any): string[] {
  const mediaItems = tweet?.legacy?.extended_entities?.media ?? tweet?.legacy?.entities?.media ?? [];
  if (!Array.isArray(mediaItems)) {
    return [];
  }

  const urls: string[] = [];
  for (const media of mediaItems) {
    if (!media) continue;
    if (media.type === "photo") {
      const imageUrl = media.media_url_https ?? media.media_url;
      if (imageUrl) urls.push(String(imageUrl));
      continue;
    }

    if (media.type === "video" || media.type === "animated_gif") {
      const variants = media.video_info?.variants;
      if (!Array.isArray(variants)) continue;
      const best = variants
        .filter((variant: any) => variant?.url && variant?.content_type === "video/mp4")
        .sort((a: any, b: any) => (b?.bitrate ?? 0) - (a?.bitrate ?? 0))[0];
      if (best?.url) {
        urls.push(String(best.url));
      }
    }
  }

  return urls;
}

export function formatMetaMarkdown(meta: Record<string, string | number | null | undefined>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
```

**Step 4: Run test to verify it passes**

Run: `bun test skills/shared/x-runtime/tweet-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/shared/x-runtime/tweet-utils.ts skills/shared/x-runtime/tweet-utils.test.ts
git commit -m "feat: create shared tweet-utils with deduplicated functions"
```

---

### Task 2: Create `shared/x-runtime/url-utils.ts` with deduplicated `parseTweetId`

**Files:**
- Create: `skills/shared/x-runtime/url-utils.ts`
- Test: `skills/shared/x-runtime/url-utils.test.ts`

**Step 1: Write the test file**

```ts
import { describe, it, expect } from "bun:test";
import { parseTweetId } from "./url-utils";

describe("parseTweetId", () => {
  it("should return bare numeric ID", () => {
    expect(parseTweetId("1234567890")).toBe("1234567890");
  });

  it("should extract ID from x.com URL", () => {
    expect(parseTweetId("https://x.com/user/status/1234567890")).toBe("1234567890");
  });

  it("should extract ID from twitter.com URL", () => {
    expect(parseTweetId("https://twitter.com/user/status/1234567890")).toBe("1234567890");
  });

  it("should handle /statuses/ path", () => {
    expect(parseTweetId("https://x.com/user/statuses/1234567890")).toBe("1234567890");
  });

  it("should return null for empty string", () => {
    expect(parseTweetId("")).toBeNull();
    expect(parseTweetId("  ")).toBeNull();
  });

  it("should return null for invalid URL", () => {
    expect(parseTweetId("not-a-url")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test skills/shared/x-runtime/url-utils.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```ts
export function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test skills/shared/x-runtime/url-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/shared/x-runtime/url-utils.ts skills/shared/x-runtime/url-utils.test.ts
git commit -m "feat: create shared url-utils with deduplicated parseTweetId"
```

---

### Task 3: Replace all duplicate definitions with imports from shared modules

**Files:**
- Modify: `skills/shared/x-runtime/graphql.ts:30-36` — delete local `unwrapTweetResult`, import from `tweet-utils`
- Modify: `skills/shared/x-runtime/thread.ts:24-30` — delete local `unwrapTweetResult`, import from `tweet-utils`
- Modify: `skills/shared/x-runtime/thread-markdown.ts:136-142` — delete local `unwrapTweetResult`, import from `tweet-utils`
- Modify: `skills/x-bookmarks/scripts/bookmarks-parser.ts:9-70` — delete `unwrapTweetResult`, `pickTweetText`, `pickUsername`, `pickMediaUrls`, import from `tweet-utils`
- Modify: `skills/x-bookmarks/scripts/tweet-detail.ts:24-95` — delete `unwrapTweetResult`, `expandTcoUrls`, `pickTweetText`, `pickUsername`, `pickMediaUrls`, import from `tweet-utils`
- Modify: `skills/shared/x-runtime/tweet-to-markdown.ts:39-75` — delete `parseTweetId`, `formatMetaMarkdown`, import from `url-utils` and `tweet-utils`
- Modify: `skills/shared/x-runtime/fxtwitter.ts:100-127` — delete `parseTweetId`, `formatMetaMarkdown`, import from `url-utils` and `tweet-utils`
- Modify: `skills/x-to-md/scripts/main.ts:87-99` — delete `parseTweetIdFromUrl`, import `parseTweetId` from `url-utils`

**Step 1: Update `graphql.ts`**

Add import at top:
```ts
import { unwrapTweetResult } from "./tweet-utils";
```

Delete the local `unwrapTweetResult` function (lines 30-36).

**Step 2: Update `thread.ts`**

Add import at top:
```ts
import { unwrapTweetResult } from "./tweet-utils";
```

Delete the local `unwrapTweetResult` function (lines 24-30).

**Step 3: Update `thread-markdown.ts`**

Add import at top:
```ts
import { unwrapTweetResult } from "./tweet-utils";
```

Delete the local `unwrapTweetResult` function (lines 136-142).

**Step 4: Update `bookmarks-parser.ts`**

Add import at top:
```ts
import { unwrapTweetResult, pickTweetText, pickUsername, pickMediaUrls } from "../../shared/x-runtime/tweet-utils";
```

Delete local functions: `unwrapTweetResult` (lines 9-17), `pickTweetText` (lines 24-28), `pickUsername` (lines 30-33), `pickMediaUrls` (lines 35-70).

Keep `pickTweetId` — it is unique to this file.

**Step 5: Update `tweet-detail.ts`**

Add import at top:
```ts
import { unwrapTweetResult, expandTcoUrls, pickTweetText, pickUsername, pickMediaUrls } from "../../shared/x-runtime/tweet-utils";
```

Delete local functions: `unwrapTweetResult` (lines 24-30), `expandTcoUrls` (lines 38-54), `pickTweetText` (lines 56-60), `pickUsername` (lines 62-65), `pickMediaUrls` (lines 67-95).

Keep `isLikelyShortLinkOnlyText` — it is unique to this file.

**Step 6: Update `tweet-to-markdown.ts`**

Add imports at top:
```ts
import { parseTweetId } from "./url-utils";
import { formatMetaMarkdown } from "./tweet-utils";
```

Delete local functions: `parseTweetId` (lines 39-53), `formatMetaMarkdown` (lines 63-75).

**Step 7: Update `fxtwitter.ts`**

Add imports at top:
```ts
import { parseTweetId } from "./url-utils";
import { formatMetaMarkdown } from "./tweet-utils";
```

Delete local functions: `parseTweetId` (lines 100-111), `formatMetaMarkdown` (lines 113-127).

**Step 8: Update `x-to-md/scripts/main.ts`**

Add import at top:
```ts
import { parseTweetId } from "../../shared/x-runtime/url-utils";
```

Delete local function `parseTweetIdFromUrl` (lines 87-99).

Replace the call `parseTweetIdFromUrl(url)` at line 107 with `parseTweetId(url)`.

**Step 9: Run typecheck and all tests**

Run: `bun run typecheck && bun run test`
Expected: All pass with no type errors

**Step 10: Commit**

```bash
git add -A
git commit -m "refactor: replace all duplicate functions with shared imports"
```

---

### Task 4: Enhance `shared/retry.ts` with `isRetryable` option

**Files:**
- Modify: `skills/shared/retry.ts`
- Modify: `skills/shared/retry.test.ts`

**Step 1: Add test for `isRetryable`**

Add to `skills/shared/retry.test.ts`:

```ts
it("should skip retry when isRetryable returns false", async () => {
  let attempts = 0;

  try {
    await retryWithBackoff(
      async () => {
        attempts++;
        throw new Error("non-retryable");
      },
      {
        maxAttempts: 3,
        delayMs: 10,
        isRetryable: (err) => err.message !== "non-retryable",
      },
    );
    expect(true).toBe(false);
  } catch (error) {
    expect((error as Error).message).toBe("non-retryable");
    expect(attempts).toBe(1);
  }
});

it("should retry when isRetryable returns true", async () => {
  let attempts = 0;

  const result = await retryWithBackoff(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("retryable");
      return "done";
    },
    {
      maxAttempts: 3,
      delayMs: 10,
      isRetryable: (err) => err.message === "retryable",
    },
  );

  expect(result).toBe("done");
  expect(attempts).toBe(3);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test skills/shared/retry.test.ts`
Expected: FAIL — `isRetryable` option not supported

**Step 3: Update `retry.ts`**

Add `isRetryable` to the `RetryOptions` type:

```ts
export type RetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
  onRetry?: (error: Error, attempt: number) => void;
  isRetryable?: (error: Error) => boolean;
};
```

In `retryWithBackoff`, destructure the new option and add the check in the catch block before the sleep:

```ts
const {
  maxAttempts = 3,
  delayMs = 1000,
  backoffFactor = 2,
  onRetry,
  isRetryable,
} = options;
```

In the catch block, after `lastError = ...` and before `if (attempt === maxAttempts)`:

```ts
if (isRetryable && !isRetryable(lastError)) {
  throw lastError;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test skills/shared/retry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/shared/retry.ts skills/shared/retry.test.ts
git commit -m "feat: add isRetryable option to retryWithBackoff"
```

---

### Task 5: Replace `bookmarks-api.ts` `withRetry` with shared `retryWithBackoff`

**Files:**
- Modify: `skills/x-bookmarks/scripts/bookmarks-api.ts`
- Test: `skills/x-bookmarks/scripts/bookmarks-api.test.ts` (existing tests)

**Step 1: Update `bookmarks-api.ts`**

Add import at top:
```ts
import { retryWithBackoff } from "../../shared/retry";
```

Delete `sleep` function (line 51-53), `isRetryableStatus` (lines 43-45), `isRetryableError` (lines 47-49), and `withRetry` (lines 94-105).

Replace `fetchBookmarksPage` implementation:

```ts
export async function fetchBookmarksPage(params: FetchBookmarksPageParams): Promise<unknown> {
  return retryWithBackoff(() => fetchBookmarksPageOnce(params), {
    maxAttempts: 4,
    isRetryable: (err) => err instanceof HttpStatusError && (err.status === 429 || err.status >= 500),
  });
}
```

**Step 2: Run typecheck and tests**

Run: `bun run typecheck && bun test skills/x-bookmarks/scripts/bookmarks-api.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/x-bookmarks/scripts/bookmarks-api.ts
git commit -m "refactor: replace local withRetry with shared retryWithBackoff"
```

---

### Task 6: Enhance `shared/arg-parser.ts` with help support and `parsePositiveInt`

**Files:**
- Modify: `skills/shared/arg-parser.ts`
- Modify: `skills/shared/arg-parser.test.ts`

**Step 1: Add tests for new features**

Add to `skills/shared/arg-parser.test.ts`:

```ts
import { createArgParser, takeOne, takeMany, parsePositiveInt } from "./arg-parser";

describe("parsePositiveInt", () => {
  it("should parse a positive integer", () => {
    expect(parsePositiveInt("42", "--count")).toBe(42);
  });

  it("should throw for zero", () => {
    expect(() => parsePositiveInt("0", "--count")).toThrow("--count must be a positive integer");
  });

  it("should throw for negative", () => {
    expect(() => parsePositiveInt("-1", "--count")).toThrow("--count must be a positive integer");
  });

  it("should throw for non-numeric", () => {
    expect(() => parsePositiveInt("abc", "--count")).toThrow("--count must be a positive integer");
  });
});

describe("createArgParser", () => {
  it("should parse flags via handlers", () => {
    type Args = { name: string; verbose: boolean };
    const parse = createArgParser<Args>(
      { name: "", verbose: false },
      new Map([
        ["--name", (args, argv, i) => { args.name = takeOne(argv, i, "--name"); return { nextIndex: i + 1 }; }],
        ["--verbose", (args) => { args.verbose = true; return { nextIndex: 0 }; }],
      ]),
    );
    const result = parse(["--name", "alice", "--verbose"]);
    expect(result.name).toBe("alice");
    expect(result.verbose).toBe(true);
  });

  it("should throw on unknown flags", () => {
    const parse = createArgParser({}, new Map());
    expect(() => parse(["--unknown"])).toThrow("Unknown option: --unknown");
  });

  it("should handle --help with usage string", () => {
    let exitCalled = false;
    const originalExit = process.exit;
    process.exit = (() => { exitCalled = true; throw new Error("exit"); }) as any;
    try {
      const parse = createArgParser({}, new Map(), { usage: "test usage" });
      parse(["--help"]);
    } catch {
      // expected
    } finally {
      process.exit = originalExit;
    }
    expect(exitCalled).toBe(true);
  });
});
```

**Step 2: Run test to verify failures**

Run: `bun test skills/shared/arg-parser.test.ts`
Expected: FAIL — `parsePositiveInt` not exported, `createArgParser` doesn't accept 3rd arg

**Step 3: Add `parsePositiveInt` and help support to `arg-parser.ts`**

Add `parsePositiveInt` export:

```ts
export function parsePositiveInt(input: string, flagName: string): number {
  const value = Number.parseInt(input, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return value;
}
```

Update `createArgParser` signature to accept an options parameter:

```ts
type ArgParserOptions = {
  usage?: string;
};

export function createArgParser<T>(
  initial: T,
  handlers: Map<string, ArgHandler<T>>,
  options?: ArgParserOptions,
): (argv: string[]) => T {
  return (argv: string[]): T => {
    const result = { ...initial };

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;

      if ((arg === "--help" || arg === "-h") && options?.usage) {
        console.log(options.usage);
        process.exit(0);
      }

      const handler = handlers.get(arg);
      if (handler) {
        const { nextIndex } = handler(result, argv, i);
        i = nextIndex;
        continue;
      }

      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }
    }

    return result;
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test skills/shared/arg-parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/shared/arg-parser.ts skills/shared/arg-parser.test.ts
git commit -m "feat: add parsePositiveInt and help support to arg-parser"
```

---

### Task 7: Migrate all 3 scripts to use `createArgParser`

**Files:**
- Modify: `skills/x-bookmarks/scripts/main.ts` — replace `parseExportArgs`
- Modify: `skills/x-bookmarks/scripts/debug.ts` — replace `parseDebugArgs`
- Modify: `skills/x-to-md/scripts/main.ts` — replace `parseExportArgs`

**Step 1: Migrate `x-bookmarks/scripts/main.ts`**

Add imports:
```ts
import { createArgParser, takeOne, parsePositiveInt } from "../../shared/arg-parser";
```

Replace the `parsePositiveInt` local function (lines 19-25) and `printUsage` (lines 27-32) and `parseExportArgs` (lines 34-82) with:

```ts
const USAGE = `Usage:
  npx -y bun skills/x-bookmarks/scripts/main.ts [--limit <n>] [--output <dir>] [--no-download-media] [--with-summary]`;

export const parseExportArgs = createArgParser<ExportArgs>(
  {
    limit: 50,
    outputDir: path.resolve(getXOutputBaseDir(), "wqq-x-bookmarks-output"),
    downloadMedia: true,
    withSummary: false,
  },
  new Map([
    ["--limit", (args, argv, i) => {
      args.limit = parsePositiveInt(takeOne(argv, i, "--limit"), "--limit");
      return { nextIndex: i + 1 };
    }],
    ["--output", (args, argv, i) => {
      args.outputDir = path.resolve(takeOne(argv, i, "--output"));
      return { nextIndex: i + 1 };
    }],
    ["--no-download-media", (args) => {
      args.downloadMedia = false;
      return { nextIndex: 0 };
    }],
    ["--with-summary", (args) => {
      args.withSummary = true;
      return { nextIndex: 0 };
    }],
  ]),
  { usage: USAGE },
);
```

**Step 2: Migrate `x-bookmarks/scripts/debug.ts`**

Add imports:
```ts
import { createArgParser, takeOne, parsePositiveInt } from "../../shared/arg-parser";
```

Replace local `parsePositiveInt` (lines 9-15), `printUsage` (lines 26-29), and `parseDebugArgs` (lines 31-62) with:

```ts
const USAGE = `Usage:
  npx -y bun skills/x-bookmarks/scripts/debug.ts [--count <n>] [--save-raw]`;

export const parseDebugArgs = createArgParser<DebugArgs>(
  {
    count: 20,
    saveRaw: false,
  },
  new Map([
    ["--count", (args, argv, i) => {
      args.count = parsePositiveInt(takeOne(argv, i, "--count"), "--count");
      return { nextIndex: i + 1 };
    }],
    ["--save-raw", (args) => {
      args.saveRaw = true;
      return { nextIndex: 0 };
    }],
  ]),
  { usage: USAGE },
);
```

**Step 3: Migrate `x-to-md/scripts/main.ts`**

Add imports:
```ts
import { createArgParser, takeOne, takeMany } from "../../shared/arg-parser";
```

Replace `printUsage` (lines 22-27), the local `takeMany` (lines 36-46), and `parseExportArgs` (lines 29-85) with:

```ts
const USAGE = `Usage:
  npx -y bun skills/x-to-md/scripts/main.ts --urls <url1> <url2> ... [--output <dir>] [--no-download-media]`;

function parseExportArgsRaw(argv: string[]): ExportArgs {
  const parse = createArgParser<ExportArgs>(
    {
      urls: [],
      outputDir: path.resolve(getXOutputBaseDir(), "wqq-x-to-md-output"),
      downloadMedia: true,
    },
    new Map([
      ["--urls", (args, argv, i) => {
        const { items, nextIndex } = takeMany(argv, i);
        if (items.length === 0) throw new Error("Missing values for --urls");
        args.urls.push(...items);
        return { nextIndex };
      }],
      ["--output", (args, argv, i) => {
        args.outputDir = path.resolve(takeOne(argv, i, "--output"));
        return { nextIndex: i + 1 };
      }],
      ["--no-download-media", (args) => {
        args.downloadMedia = false;
        return { nextIndex: 0 };
      }],
    ]),
    { usage: USAGE },
  );

  return parse(argv);
}

export function parseExportArgs(argv: string[]): ExportArgs {
  const args = parseExportArgsRaw(argv);
  if (args.urls.length === 0) {
    throw new Error("--urls is required");
  }
  return args;
}
```

**Step 4: Run typecheck and all tests**

Run: `bun run typecheck && bun run test`
Expected: All pass

**Step 5: Commit**

```bash
git add skills/x-bookmarks/scripts/main.ts skills/x-bookmarks/scripts/debug.ts skills/x-to-md/scripts/main.ts
git commit -m "refactor: migrate all arg parsing to shared createArgParser"
```

---

### Task 8: Small fixes — stale path, cache TTL, unused parameter

**Files:**
- Modify: `skills/shared/x-runtime/tweet-to-markdown.ts:183`
- Modify: `skills/shared/x-runtime/http.ts:5-26`
- Modify: `skills/shared/x-runtime/output.ts:103-105`

**Step 1: Fix stale path in `tweet-to-markdown.ts`**

Change line 183 from:
```ts
    console.error("  npx -y bun skills/baoyu-danger-x-to-markdown/scripts/tweet-to-markdown.ts <tweet url>");
```
to:
```ts
    console.error("  npx -y bun skills/shared/x-runtime/tweet-to-markdown.ts <tweet url>");
```

**Step 2: Add TTL to `cachedHomeHtml` in `http.ts`**

Replace the cache variable and `fetchHomeHtml` function:

```ts
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedHomeHtml: { userAgent: string; html: string; timestamp: number } | null = null;

export async function fetchHomeHtml(userAgent: string = DEFAULT_USER_AGENT): Promise<string> {
  const now = Date.now();
  if (cachedHomeHtml?.userAgent === userAgent && now - cachedHomeHtml.timestamp < CACHE_TTL_MS) {
    return cachedHomeHtml.html;
  }
  const html = await fetchText("https://x.com", {
    headers: {
      "user-agent": userAgent,
    },
  });
  cachedHomeHtml = { userAgent, html, timestamp: now };
  return html;
}
```

**Step 3: Remove unused `_markdownPath` parameter in `output.ts`**

Change `shouldSkipTweetOutput` from:
```ts
export function shouldSkipTweetOutput(_markdownPath: string, exists: boolean): boolean {
  return exists;
}
```
to:
```ts
export function shouldSkipTweetOutput(exists: boolean): boolean {
  return exists;
}
```

Then update all callers:

In `skills/x-bookmarks/scripts/main.ts` (line 155):
```ts
// Before:
if (shouldSkipTweetOutput(existingPath ?? "", Boolean(existingPath))) {
// After:
if (shouldSkipTweetOutput(Boolean(existingPath))) {
```

In `skills/x-to-md/scripts/main.ts` (line 114):
```ts
// Before:
if (shouldSkipTweetOutput(existingPath ?? "", Boolean(existingPath))) {
// After:
if (shouldSkipTweetOutput(Boolean(existingPath))) {
```

**Step 4: Run typecheck and all tests**

Run: `bun run typecheck && bun run test`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/shared/x-runtime/tweet-to-markdown.ts skills/shared/x-runtime/http.ts skills/shared/x-runtime/output.ts skills/x-bookmarks/scripts/main.ts skills/x-to-md/scripts/main.ts
git commit -m "fix: stale path ref, add cache TTL, remove unused parameter"
```

---

### Task 9: Add core types to `shared/x-runtime/types.ts`

**Files:**
- Modify: `skills/shared/x-runtime/types.ts`

**Step 1: Add type definitions to `types.ts`**

Append to the end of the existing file:

```ts
export type VideoVariant = {
  url?: string;
  content_type?: string;
  bitrate?: number;
};

export type UrlEntity = {
  url?: string;
  expanded_url?: string;
  unwound_url?: string;
  display_url?: string;
};

export type MediaEntity = {
  type?: string;
  media_url_https?: string;
  media_url?: string;
  video_info?: { variants?: VideoVariant[] };
};

export type TweetLegacy = {
  id_str?: string;
  full_text?: string;
  text?: string;
  extended_entities?: { media?: MediaEntity[] };
  entities?: { media?: MediaEntity[]; urls?: UrlEntity[] };
  article?: unknown;
  article_results?: { result?: unknown };
};

export type UserLegacy = {
  screen_name?: string;
  name?: string;
};

export type TweetResult = {
  __typename?: string;
  tweet?: TweetResult;
  rest_id?: string;
  core?: { user_results?: { result?: { legacy?: UserLegacy } } };
  legacy?: TweetLegacy;
  note_tweet?: { note_tweet_results?: { result?: { text?: string } } };
  article?: unknown;
  article_results?: { result?: unknown };
};

export type TimelineInstruction = {
  entries?: unknown[];
  moduleItems?: unknown[];
};

export type BookmarkTimelineResponse = {
  data?: {
    bookmark_timeline_v2?: {
      timeline?: { instructions?: TimelineInstruction[] };
    };
  };
};
```

**Step 2: Update `tweet-utils.ts` to use types**

Update function signatures in `tweet-utils.ts`:

```ts
import type { TweetResult } from "./types";

export function unwrapTweetResult(result: TweetResult | null | undefined): TweetResult | null {
  // ... same body ...
}

export function expandTcoUrls(text: string, tweet: TweetResult | null | undefined): string {
  const urls = (tweet?.legacy?.entities?.urls ?? []) as Array<{ url?: string; expanded_url?: string; unwound_url?: string }>;
  // ... rest same ...
}

export function pickTweetText(tweet: TweetResult | null | undefined): string {
  // ... same body ...
}

export function pickUsername(tweet: TweetResult | null | undefined): string | null {
  // ... same body ...
}

export function pickMediaUrls(tweet: TweetResult | null | undefined): string[] {
  // ... same body, keep internal `any` casts for sort callback ...
}
```

**Step 3: Update `bookmarks-parser.ts` to use `BookmarkTimelineResponse`**

In `extractBookmarkPageDetails`, change:
```ts
export function extractBookmarkPageDetails(payload: unknown): BookmarkPageDetails {
  const instructions = (payload as any)?.data?.bookmark_timeline_v2?.timeline?.instructions;
```
to:
```ts
import type { BookmarkTimelineResponse } from "../../shared/x-runtime/types";

export function extractBookmarkPageDetails(payload: unknown): BookmarkPageDetails {
  const typed = payload as BookmarkTimelineResponse;
  const instructions = typed?.data?.bookmark_timeline_v2?.timeline?.instructions;
```

**Step 4: Run typecheck and tests**

Run: `bun run typecheck && bun run test`
Expected: PASS

**Step 5: Commit**

```bash
git add skills/shared/x-runtime/types.ts skills/shared/x-runtime/tweet-utils.ts skills/x-bookmarks/scripts/bookmarks-parser.ts
git commit -m "feat: add core tweet types, apply to shared utilities"
```

---

### Task 10: Add tests for `wqq-skills-env.ts`

**Files:**
- Create: `skills/shared/wqq-skills-env.test.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect } from "bun:test";
import {
  parseDotEnv,
  getWqqSkillsEnvFilePath,
  loadDotEnvFile,
  applyFileOnlyKeysToEnvObject,
} from "./wqq-skills-env";

describe("parseDotEnv", () => {
  it("should parse simple key=value pairs", () => {
    expect(parseDotEnv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("should skip comments and empty lines", () => {
    expect(parseDotEnv("# comment\n\nFOO=bar")).toEqual({ FOO: "bar" });
  });

  it("should handle export prefix", () => {
    expect(parseDotEnv("export FOO=bar")).toEqual({ FOO: "bar" });
  });

  it("should strip single and double quotes", () => {
    expect(parseDotEnv('FOO="bar"\nBAZ=\'qux\'')).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("should handle value with equals sign", () => {
    expect(parseDotEnv("URL=https://example.com?a=1&b=2")).toEqual({
      URL: "https://example.com?a=1&b=2",
    });
  });

  it("should skip lines without equals", () => {
    expect(parseDotEnv("NOEQ")).toEqual({});
  });

  it("should return empty object for empty input", () => {
    expect(parseDotEnv("")).toEqual({});
  });
});

describe("getWqqSkillsEnvFilePath", () => {
  it("should construct path under .wqq-skills", () => {
    const result = getWqqSkillsEnvFilePath("/home/user");
    expect(result).toBe("/home/user/.wqq-skills/.env");
  });
});

describe("loadDotEnvFile", () => {
  it("should return empty object for non-existent file", async () => {
    const result = await loadDotEnvFile("/tmp/does-not-exist-xyz/.env");
    expect(result).toEqual({});
  });
});

describe("applyFileOnlyKeysToEnvObject", () => {
  it("should override target keys from file env", () => {
    const target: Record<string, string | undefined> = { A: "old", B: "keep" };
    applyFileOnlyKeysToEnvObject(target, { A: "new" }, ["A"]);
    expect(target.A).toBe("new");
    expect(target.B).toBe("keep");
  });

  it("should set undefined for keys not in file env", () => {
    const target: Record<string, string | undefined> = { A: "old" };
    applyFileOnlyKeysToEnvObject(target, {}, ["A"]);
    expect(target.A).toBeUndefined();
  });
});
```

**Step 2: Run test**

Run: `bun test skills/shared/wqq-skills-env.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/shared/wqq-skills-env.test.ts
git commit -m "test: add unit tests for wqq-skills-env"
```

---

### Task 11: Add tests for `fxtwitter.ts`

**Files:**
- Create: `skills/shared/x-runtime/fxtwitter.test.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect } from "bun:test";
import { fetchFxtweet } from "./fxtwitter";

describe("fetchFxtweet", () => {
  it("should throw for non-200 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("", { status: 500 });
    try {
      await expect(fetchFxtweet("123")).rejects.toThrow("fxtwitter API error (500)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should throw when tweet is null in response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 404, message: "Not Found", tweet: null }), { status: 200 });
    try {
      await expect(fetchFxtweet("123")).rejects.toThrow("Tweet not found: Not Found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should return tweet data for valid response", async () => {
    const tweetData = {
      id: "123",
      text: "hello",
      url: "https://x.com/user/status/123",
      author: { name: "Test", screen_name: "test" },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 200, message: "OK", tweet: tweetData }), { status: 200 });
    try {
      const result = await fetchFxtweet("123");
      expect(result.id).toBe("123");
      expect(result.text).toBe("hello");
      expect(result.author.screen_name).toBe("test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

**Step 2: Run test**

Run: `bun test skills/shared/x-runtime/fxtwitter.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/shared/x-runtime/fxtwitter.test.ts
git commit -m "test: add unit tests for fxtwitter"
```

---

### Task 12: Create `shared/x-runtime/index.ts` barrel file

**Files:**
- Create: `skills/shared/x-runtime/index.ts`

**Step 1: Create the barrel file**

```ts
// Tweet data extraction utilities
export {
  unwrapTweetResult,
  expandTcoUrls,
  pickTweetText,
  pickUsername,
  pickMediaUrls,
  formatMetaMarkdown,
} from "./tweet-utils";

// URL parsing utilities
export { parseTweetId } from "./url-utils";

// Types
export type {
  XCookieMap,
  CookieLike,
  ArticleEntity,
  ArticleContentState,
  ArticleBlock,
  TweetResult,
  TweetLegacy,
  MediaEntity,
  VideoVariant,
  UrlEntity,
  UserLegacy,
  BookmarkTimelineResponse,
} from "./types";

// Cookie management
export { loadXCookies, hasRequiredXCookies, buildCookieHeader } from "./cookies";

// Output directory management
export {
  buildTweetOutputDirName,
  resolveTweetOutputPath,
  findExistingTweetMarkdownPath,
  shouldSkipTweetOutput,
} from "./output";

// Media download
export { localizeMarkdownMedia } from "./media-localizer";
export type { LocalizeMarkdownMediaOptions, LocalizeMarkdownMediaResult } from "./media-localizer";
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add skills/shared/x-runtime/index.ts
git commit -m "feat: add barrel file for x-runtime exports"
```

---

### Task 13: Final verification

**Step 1: Run all tests**

Run: `bun run test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Verify no orphaned imports**

Run: `grep -r "from.*tweet-utils\|from.*url-utils\|from.*retry\|from.*arg-parser" skills/ --include="*.ts" | head -30`
Expected: All imports resolve correctly

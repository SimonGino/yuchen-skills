# OPENAI_API_FORMAT Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `OPENAI_API_FORMAT` env key so users can explicitly choose between OpenAI Responses API and Chat Completions API, avoiding unnecessary fallback requests.

**Architecture:** New shared helper `resolveOpenAiApiFormat()` parses the env key. Each skill's summarize function branches on the resolved format before making HTTP calls. Default `"auto"` preserves existing fallback behavior.

**Tech Stack:** Bun runtime, TypeScript, bun:test

---

### Task 1: Create shared helper with tests

**Files:**
- Create: `skills/shared/openai-format.ts`
- Create: `skills/shared/openai-format.test.ts`

**Step 1: Write the failing test**

Create `skills/shared/openai-format.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { resolveOpenAiApiFormat } from "./openai-format";

describe("resolveOpenAiApiFormat", () => {
  test("returns 'responses' when OPENAI_API_FORMAT is 'responses'", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "responses" } as NodeJS.ProcessEnv)).toBe("responses");
  });

  test("returns 'chat' when OPENAI_API_FORMAT is 'chat'", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "chat" } as NodeJS.ProcessEnv)).toBe("chat");
  });

  test("returns 'auto' when OPENAI_API_FORMAT is 'auto'", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "auto" } as NodeJS.ProcessEnv)).toBe("auto");
  });

  test("returns 'auto' when OPENAI_API_FORMAT is not set", () => {
    expect(resolveOpenAiApiFormat({} as NodeJS.ProcessEnv)).toBe("auto");
  });

  test("trims and lowercases the value", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "  Chat  " } as NodeJS.ProcessEnv)).toBe("chat");
  });

  test("returns 'auto' for unknown values", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "invalid" } as NodeJS.ProcessEnv)).toBe("auto");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test skills/shared/openai-format.test.ts`
Expected: FAIL — module `./openai-format` not found

**Step 3: Write minimal implementation**

Create `skills/shared/openai-format.ts`:

```ts
export type OpenAiApiFormat = "responses" | "chat" | "auto";

export function resolveOpenAiApiFormat(env: NodeJS.ProcessEnv): OpenAiApiFormat {
  const raw = env.OPENAI_API_FORMAT?.trim().toLowerCase();
  if (raw === "responses" || raw === "chat") return raw;
  return "auto";
}
```

**Step 4: Run test to verify it passes**

Run: `bun test skills/shared/openai-format.test.ts`
Expected: PASS — all 6 tests pass

**Step 5: Commit**

```bash
git add skills/shared/openai-format.ts skills/shared/openai-format.test.ts
git commit -m "feat: add resolveOpenAiApiFormat shared helper"
```

---

### Task 2: Update x-to-md summarize to use OPENAI_API_FORMAT

**Files:**
- Modify: `skills/x-to-md/scripts/summarize.ts` (lines 1, 22, 154-162)

**Step 1: Add import and update FILE_ONLY_ENV_KEYS**

In `skills/x-to-md/scripts/summarize.ts`:

Add import at line 1 area:
```ts
import { resolveOpenAiApiFormat } from "../../shared/openai-format";
```

Change `FILE_ONLY_ENV_KEYS` (line 22) from:
```ts
const FILE_ONLY_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;
```
to:
```ts
const FILE_ONLY_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_FORMAT"] as const;
```

**Step 2: Update `requestOpenAiSummary` function**

Replace lines 154-162 with:

```ts
async function requestOpenAiSummary(input: OpenAiRequestInput): Promise<string> {
  const format = resolveOpenAiApiFormat(input.env);
  if (format === "chat") return requestChatCompletionsSummary(input);
  if (format === "responses") return requestResponsesSummary(input);
  try {
    return await requestResponsesSummary(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log?.(`[x-to-md] responses summarization fallback to chat (${message})`);
  }
  return requestChatCompletionsSummary(input);
}
```

**Step 3: Run existing tests to verify no regression**

Run: `bun test skills/x-to-md/scripts/summarize.test.ts`
Expected: PASS — all 3 existing tests still pass (they use `summarizeImpl`, unaffected by format routing)

**Step 4: Commit**

```bash
git add skills/x-to-md/scripts/summarize.ts
git commit -m "feat(x-to-md): support OPENAI_API_FORMAT env key"
```

---

### Task 3: Add x-to-md format routing tests

**Files:**
- Modify: `skills/x-to-md/scripts/summarize.test.ts`

**Step 1: Write the failing tests**

Append to `skills/x-to-md/scripts/summarize.test.ts` — add a new `describe` block after the existing one:

```ts
describe("summarizeMarkdownToChinese API format routing", () => {
  const markdown = `---
url: "https://x.com/alice/status/1"
authorUsername: "alice"
---

# Hello World

This is a long article about building AI agents for software development.
`;

  const responsesReply = JSON.stringify({
    output: [{ content: [{ type: "output_text", text: "来自responses的摘要" }] }],
  });

  const chatReply = JSON.stringify({
    choices: [{ message: { content: "来自chat的摘要" } }],
  });

  test("format=chat only calls /chat/completions", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(chatReply, { status: 200, headers: { "content-type": "application/json" } });
    };

    const output = await summarizeMarkdownToChinese(markdown, {
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.example.com/v1",
        OPENAI_API_FORMAT: "chat",
      } as NodeJS.ProcessEnv,
    });

    expect(calls).toEqual(["https://api.example.com/v1/chat/completions"]);
    expect(output).toContain("来自chat的摘要");
  });

  test("format=responses only calls /responses", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(responsesReply, { status: 200, headers: { "content-type": "application/json" } });
    };

    const output = await summarizeMarkdownToChinese(markdown, {
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.example.com/v1",
        OPENAI_API_FORMAT: "responses",
      } as NodeJS.ProcessEnv,
    });

    expect(calls).toEqual(["https://api.example.com/v1/responses"]);
    expect(output).toContain("来自responses的摘要");
  });

  test("format=responses does not fallback on failure", async () => {
    const fakeFetch = async () => {
      return new Response(JSON.stringify({ error: "fail" }), { status: 500 });
    };

    await expect(
      summarizeMarkdownToChinese(markdown, {
        fetchImpl: fakeFetch as unknown as typeof fetch,
        env: {
          OPENAI_API_KEY: "test-key",
          OPENAI_BASE_URL: "https://api.example.com/v1",
          OPENAI_API_FORMAT: "responses",
        } as NodeJS.ProcessEnv,
      }),
    ).rejects.toThrow();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `bun test skills/x-to-md/scripts/summarize.test.ts`
Expected: PASS — all 6 tests pass (3 existing + 3 new)

**Step 3: Commit**

```bash
git add skills/x-to-md/scripts/summarize.test.ts
git commit -m "test(x-to-md): add OPENAI_API_FORMAT routing tests"
```

---

### Task 4: Update x-bookmarks summary to use OPENAI_API_FORMAT

**Files:**
- Modify: `skills/x-bookmarks/scripts/summary.ts` (lines 1-3, 39, 312-381)

**Step 1: Add import and update FILE_ONLY_ENV_KEYS**

In `skills/x-bookmarks/scripts/summary.ts`:

Add import near the top:
```ts
import { resolveOpenAiApiFormat } from "../../shared/openai-format";
```

Change `FILE_ONLY_ENV_KEYS` (line 39) from:
```ts
const FILE_ONLY_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL"] as const;
```
to:
```ts
const FILE_ONLY_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_FORMAT"] as const;
```

**Step 2: Update `generateAiSummaryForBookmark` function**

Replace the try/catch blocks at lines 337-380 (the part after `const model = ...`) with:

```ts
  const format = resolveOpenAiApiFormat(env);
  const requestInput = { fetchImpl, baseUrl, apiKey, model, markdown: input.markdown };

  if (format === "chat") {
    try {
      const content = await requestChatCompletionsSummaryContent(requestInput);
      const parsed = parseAiSummaryContent(content);
      if (!parsed) throw new Error("OpenAI /chat/completions summary format is invalid");
      return { ...parsed, usedFallback: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.log?.(`[bookmarks-export] ai summary chat failed: ${input.url} (${message})`);
      return fallback;
    }
  }

  if (format === "responses") {
    try {
      const content = await requestResponsesSummaryContent(requestInput);
      const parsed = parseAiSummaryContent(content);
      if (!parsed) throw new Error("OpenAI /responses summary format is invalid");
      return { ...parsed, usedFallback: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.log?.(`[bookmarks-export] ai summary responses failed: ${input.url} (${message})`);
      return fallback;
    }
  }

  // auto: try responses first, fallback to chat
  try {
    const content = await requestResponsesSummaryContent(requestInput);
    const parsed = parseAiSummaryContent(content);
    if (!parsed) throw new Error("OpenAI /responses summary format is invalid");
    return { ...parsed, usedFallback: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log?.(`[bookmarks-export] ai summary responses fallback to chat: ${input.url} (${message})`);
  }

  try {
    const content = await requestChatCompletionsSummaryContent(requestInput);
    const parsed = parseAiSummaryContent(content);
    if (!parsed) throw new Error("OpenAI /chat/completions summary format is invalid");
    return { ...parsed, usedFallback: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log?.(`[bookmarks-export] ai summary fallback: ${input.url} (${message})`);
    return fallback;
  }
```

**Step 3: Run existing tests to verify no regression**

Run: `bun test skills/x-bookmarks/scripts/summary.test.ts`
Expected: PASS — all existing tests still pass

**Step 4: Commit**

```bash
git add skills/x-bookmarks/scripts/summary.ts
git commit -m "feat(x-bookmarks): support OPENAI_API_FORMAT env key"
```

---

### Task 5: Add x-bookmarks format routing tests

**Files:**
- Modify: `skills/x-bookmarks/scripts/summary.test.ts`

**Step 1: Write the failing tests**

Append to the `describe("generateAiSummaryForBookmark", ...)` block in `skills/x-bookmarks/scripts/summary.test.ts`:

```ts
  test("format=chat only calls /chat/completions", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "一句话摘要：chat摘要\n相关性说明：chat相关" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const result = await generateAiSummaryForBookmark({
      markdown: "# Title\n\nBody",
      fallbackExcerpt: "Fallback excerpt",
      url: "https://x.com/a/status/1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_API_FORMAT: "chat",
      } as NodeJS.ProcessEnv,
    });

    expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
    expect(result.oneLineSummary).toContain("chat摘要");
    expect(result.usedFallback).toBe(false);
  });

  test("format=responses only calls /responses", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: "一句话摘要：responses摘要\n相关性说明：responses相关" }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const result = await generateAiSummaryForBookmark({
      markdown: "# Title\n\nBody",
      fallbackExcerpt: "Fallback excerpt",
      url: "https://x.com/a/status/1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_API_FORMAT: "responses",
      } as NodeJS.ProcessEnv,
    });

    expect(calls).toEqual(["https://api.openai.com/v1/responses"]);
    expect(result.oneLineSummary).toContain("responses摘要");
    expect(result.usedFallback).toBe(false);
  });

  test("format=responses returns fallback on failure (no fallback to chat)", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ error: "fail" }), { status: 500 });
    };

    const result = await generateAiSummaryForBookmark({
      markdown: "# Title\n\nBody",
      fallbackExcerpt: "Fallback excerpt",
      url: "https://x.com/a/status/1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_API_FORMAT: "responses",
      } as NodeJS.ProcessEnv,
    });

    expect(calls).toEqual(["https://api.openai.com/v1/responses"]);
    expect(result.usedFallback).toBe(true);
  });

  test("format=chat returns fallback on failure (no fallback to responses)", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ error: "fail" }), { status: 500 });
    };

    const result = await generateAiSummaryForBookmark({
      markdown: "# Title\n\nBody",
      fallbackExcerpt: "Fallback excerpt",
      url: "https://x.com/a/status/1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_API_FORMAT: "chat",
      } as NodeJS.ProcessEnv,
    });

    expect(calls).toEqual(["https://api.openai.com/v1/chat/completions"]);
    expect(result.usedFallback).toBe(true);
  });
```

**Step 2: Run tests to verify they pass**

Run: `bun test skills/x-bookmarks/scripts/summary.test.ts`
Expected: PASS — all tests pass (existing + 4 new)

**Step 3: Commit**

```bash
git add skills/x-bookmarks/scripts/summary.test.ts
git commit -m "test(x-bookmarks): add OPENAI_API_FORMAT routing tests"
```

---

### Task 6: Update README documentation

**Files:**
- Modify: `skills/x-bookmarks/README.md`

**Step 1: Update the AI summary config section**

Replace the config section (lines 52-62) with:

````markdown
配置（`~/.wqq-skills/.env`）：

```bash
mkdir -p ~/.wqq-skills
cat >> ~/.wqq-skills/.env << 'EOF'
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
EOF
```

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `OPENAI_MODEL` | `gpt-4o-mini` | 用于生成摘要的模型 |
| `OPENAI_API_FORMAT` | `auto` | API 格式：`responses`（OpenAI Responses API）、`chat`（Chat Completions API）、`auto`（先 responses 后 chat fallback） |

**API 格式说明：**
- `responses` — 仅调用 `/responses` 端点（OpenAI 官方 API 推荐）
- `chat` — 仅调用 `/chat/completions` 端点（兼容 Groq、Deepseek、Ollama 等第三方 provider）
- `auto` — 先尝试 `/responses`，失败后自动回退到 `/chat/completions`（默认行为）
````

**Step 2: Verify README renders correctly**

Visual check: read the file to confirm formatting is correct.

**Step 3: Commit**

```bash
git add skills/x-bookmarks/README.md
git commit -m "docs(x-bookmarks): document OPENAI_API_FORMAT env key"
```

---

### Task 7: Run full test suite and final verification

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run type check**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Final commit (if any fixes needed)**

Only if steps 1-2 revealed issues that required fixes.

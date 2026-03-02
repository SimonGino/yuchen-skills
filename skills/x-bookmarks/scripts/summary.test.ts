import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  generateAiSummaryForBookmark,
  parseBookmarkMarkdown,
  renderBookmarkSummaryMarkdown,
  writeBookmarkSummary,
} from "./summary";

describe("parseBookmarkMarkdown", () => {
  test("extracts summary fields from bookmark markdown", () => {
    const markdown = `---
url: "https://x.com/eyad_khrais/status/2010076957938188661"
authorUsername: "eyad_khrais"
tweetId: "2010076957938188661"
---

# The complete claude code tutorial

I have used Claude Code for years and this is my playbook.
`;

    const entry = parseBookmarkMarkdown("2010076957938188661", markdown);
    expect(entry.title).toBe("The complete claude code tutorial");
    expect(entry.authorUsername).toBe("eyad_khrais");
    expect(entry.url).toContain("/status/2010076957938188661");
    expect(entry.excerpt).toContain("playbook");
  });
});

describe("renderBookmarkSummaryMarkdown", () => {
  test("renders three-part summary format", () => {
    const markdown = renderBookmarkSummaryMarkdown([
      {
        tweetId: "1",
        title: "A title",
        authorUsername: "alice",
        url: "https://x.com/alice/status/1",
        oneLineSummary: "这是一句话摘要",
        relevanceReason: "它解释了工程实践中的关键取舍",
        relativePath: "20260110-100000-a-alice-1/1.md",
      },
    ]);

    expect(markdown).toContain("一句话摘要：这是一句话摘要");
    expect(markdown).toContain("相关性说明：它解释了工程实践中的关键取舍");
    expect(markdown).toContain("来源链接：[原帖](https://x.com/alice/status/1)");
  });
});

describe("generateAiSummaryForBookmark", () => {
  test("throws when OPENAI_API_KEY is missing", async () => {
    let capturedError: unknown;
    try {
      await generateAiSummaryForBookmark({
        markdown: "# Title\n\nBody",
        fallbackExcerpt: "Fallback excerpt",
        url: "https://x.com/a/status/1",
        env: {} as NodeJS.ProcessEnv,
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toContain("OPENAI_API_KEY");
  });

  test("returns structured summary from responses endpoint", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "一句话摘要：这是测试摘要\n相关性说明：这条内容与工程实践直接相关",
                },
              ],
            },
          ],
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
      } as NodeJS.ProcessEnv,
    });

    expect(result.oneLineSummary).toContain("测试摘要");
    expect(result.relevanceReason).toContain("工程实践");
    expect(result.usedFallback).toBe(false);
    expect(calls).toEqual(["https://api.openai.com/v1/responses"]);
  });

  test("falls back to chat completions when responses endpoint fails", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);

      if (url.endsWith("/responses")) {
        return new Response(JSON.stringify({ error: { message: "not found" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "一句话摘要：来自 chat 的摘要\n相关性说明：chat 回退成功",
              },
            },
          ],
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
      } as NodeJS.ProcessEnv,
    });

    expect(result.oneLineSummary).toContain("chat 的摘要");
    expect(result.relevanceReason).toContain("回退成功");
    expect(result.usedFallback).toBe(false);
    expect(calls).toEqual([
      "https://api.openai.com/v1/responses",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  test("falls back when both endpoints fail", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);

      if (url.endsWith("/responses")) {
        return new Response(JSON.stringify({ error: { message: "server error" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error("network");
    };

    const result = await generateAiSummaryForBookmark({
      markdown: "# Title\n\nBody",
      fallbackExcerpt: "Fallback excerpt",
      url: "https://x.com/a/status/1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
      } as NodeJS.ProcessEnv,
    });

    expect(result.oneLineSummary).toBe("Fallback excerpt");
    expect(result.relevanceReason).toContain("技术实践相关");
    expect(result.usedFallback).toBe(true);
    expect(calls).toEqual([
      "https://api.openai.com/v1/responses",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });
});

describe("writeBookmarkSummary", () => {
  test("throws when OPENAI_API_KEY is missing", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "x-bookmarks-"));
    const itemDir = path.join(out, "20260110-100000-a-alice-1");
    await mkdir(itemDir, { recursive: true });
    await Bun.write(
      path.join(itemDir, "1.md"),
      `---
url: "https://x.com/alice/status/1"
authorUsername: "alice"
---

# Title
Body`
    );

    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalBaseUrl = process.env.OPENAI_BASE_URL;
    const originalHome = process.env.HOME;
    const fakeHome = await mkdtemp(path.join(tmpdir(), "wqq-home-"));

    process.env.HOME = fakeHome;
    process.env.OPENAI_API_KEY = "env-key";
    process.env.OPENAI_BASE_URL = "https://env.example/v1";

    try {
      await expect(
        writeBookmarkSummary(out, [{ tweetId: "1", markdownPath: path.join(itemDir, "1.md") }])
      ).rejects.toThrow("OPENAI_API_KEY");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }

      if (originalBaseUrl === undefined) {
        delete process.env.OPENAI_BASE_URL;
      } else {
        process.env.OPENAI_BASE_URL = originalBaseUrl;
      }
    }
  });

  test("uses ai summary when OPENAI_API_KEY is configured", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "x-bookmarks-"));
    const itemDir = path.join(out, "20260110-100000-a-alice-1");
    await mkdir(itemDir, { recursive: true });
    await Bun.write(
      path.join(itemDir, "1.md"),
      `---
url: "https://x.com/alice/status/1"
authorUsername: "alice"
---

# Title
Body`
    );

    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalBaseUrl = process.env.OPENAI_BASE_URL;
    const originalHome = process.env.HOME;
    const fakeHome = await mkdtemp(path.join(tmpdir(), "wqq-home-"));
    const calls: string[] = [];

    globalThis.fetch = ((async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "一句话摘要：AI 摘要\n相关性说明：AI 相关性",
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown) as typeof fetch;

    await mkdir(path.join(fakeHome, ".wqq-skills"), { recursive: true });
    await Bun.write(
      path.join(fakeHome, ".wqq-skills", ".env"),
      "OPENAI_API_KEY=file-key\nOPENAI_BASE_URL=https://file.example/v1\n",
    );

    process.env.HOME = fakeHome;
    process.env.OPENAI_API_KEY = "env-key";
    process.env.OPENAI_BASE_URL = "https://env.example/v1";

    try {
      const summaryPath = await writeBookmarkSummary(out, [{ tweetId: "1", markdownPath: path.join(itemDir, "1.md") }]);
      const text = await readFile(summaryPath!, "utf8");

      expect(text).toContain("一句话摘要：AI 摘要");
      expect(text).toContain("相关性说明：AI 相关性");
      expect(calls).toEqual(["https://file.example/v1/responses"]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }

      if (originalBaseUrl === undefined) {
        delete process.env.OPENAI_BASE_URL;
      } else {
        process.env.OPENAI_BASE_URL = originalBaseUrl;
      }
    }
  });
});

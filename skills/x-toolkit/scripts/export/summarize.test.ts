import { describe, expect, test } from "bun:test";
import { summarizeMarkdownToChinese } from "./summarize";

describe("summarizeMarkdownToChinese", () => {
  test("injects summary into frontmatter and blockquote", async () => {
    const markdown = `---
url: "https://x.com/alice/status/1"
authorUsername: "alice"
---

# Hello World

This is a long article about building AI agents for software development.
`;

    const output = await summarizeMarkdownToChinese(markdown, {
      summarizeImpl: async () => "这是一篇关于构建AI代理的文章",
      env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
    });

    expect(output).toContain('summary: "这是一篇关于构建AI代理的文章"');
    expect(output).toContain("> 这是一篇关于构建AI代理的文章");
    expect(output).toContain("# Hello World");
    expect(output).toContain("This is a long article");
  });

  test("returns original markdown when body is empty", async () => {
    const markdown = `---
url: "https://x.com/alice/status/1"
---
`;
    let calls = 0;
    const output = await summarizeMarkdownToChinese(markdown, {
      summarizeImpl: async () => {
        calls += 1;
        return "should not be called";
      },
      env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
    });

    expect(output).toBe(markdown);
    expect(calls).toBe(0);
  });

  test("places blockquote at top when no heading exists", async () => {
    const markdown = `---
url: "https://x.com/alice/status/1"
---

Just a simple tweet with some content about tech.
`;

    const output = await summarizeMarkdownToChinese(markdown, {
      summarizeImpl: async () => "一条关于技术的推文",
      env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
    });

    expect(output).toContain('summary: "一条关于技术的推文"');
    expect(output).toContain("> 一条关于技术的推文");
    expect(output).toContain("Just a simple tweet");
  });
});

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

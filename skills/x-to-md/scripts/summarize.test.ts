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

import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildTweetOutputDirName, findExistingTweetMarkdownPath } from "./output";

describe("buildTweetOutputDirName", () => {
  test("uses timestamp-title-author-id order", () => {
    const markdown = `---
authorUsername: "AI_Jasonyu"
---

# AI 增长框架
正文`;
    const dir = buildTweetOutputDirName("2010076957938188661", markdown);
    expect(dir.startsWith("20260110-195106-AI-增长框架-")).toBe(true);
    expect(dir).toContain("-AI_Jasonyu-2010076957938188661");
  });
});

describe("findExistingTweetMarkdownPath", () => {
  test("finds existing markdown path by tweet id", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "x-bookmarks-output-"));
    try {
      const dir = path.join(baseDir, "AI-增长框架-AI_Jasonyu-2022");
      await mkdir(dir, { recursive: true });
      const markdownPath = path.join(dir, "2022.md");
      await writeFile(markdownPath, "demo", "utf8");
      expect(findExistingTweetMarkdownPath(baseDir, "2022")).toBe(markdownPath);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});

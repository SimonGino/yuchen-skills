import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildTweetOutputDirName, findExistingTweetMarkdownPath, tweetIdToEpochMs } from "./output";

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

describe("tweetIdToEpochMs", () => {
  test("returns correct epoch ms for known tweet id", () => {
    // ID 2010076957938188661 corresponds to 20260110-195106 UTC
    const ms = tweetIdToEpochMs("2010076957938188661");
    expect(ms).not.toBeNull();
    const date = new Date(ms!);
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(0); // January
    expect(date.getUTCDate()).toBe(10);
  });

  test("returns null for non-numeric input", () => {
    expect(tweetIdToEpochMs("invalid")).toBeNull();
    expect(tweetIdToEpochMs("")).toBeNull();
    expect(tweetIdToEpochMs("abc123")).toBeNull();
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

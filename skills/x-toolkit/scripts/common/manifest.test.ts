import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeManifest } from "./manifest";
import type { ManifestFile } from "../types";

describe("writeManifest", () => {
  test("writes valid manifest.json", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "manifest-"));
    try {
      const manifest: ManifestFile = {
        exportedAt: "2026-03-24T10:00:00.000Z",
        source: "bookmarks",
        newFiles: [
          { tweetId: "123", path: "20260324-demo-user-123/123.md", author: "user" },
        ],
        skipped: ["456"],
        failed: ["789"],
      };

      const resultPath = await writeManifest(dir, manifest);
      expect(resultPath).toBe(path.join(dir, "manifest.json"));

      const content = JSON.parse(await readFile(resultPath, "utf8"));
      expect(content.source).toBe("bookmarks");
      expect(content.newFiles).toHaveLength(1);
      expect(content.newFiles[0].tweetId).toBe("123");
      expect(content.skipped).toEqual(["456"]);
      expect(content.failed).toEqual(["789"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("overwrites existing manifest.json", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "manifest-"));
    try {
      await writeFile(path.join(dir, "manifest.json"), '{"old": true}', "utf8");

      const manifest: ManifestFile = {
        exportedAt: "2026-03-24T11:00:00.000Z",
        source: "urls",
        newFiles: [],
        skipped: [],
        failed: [],
      };

      await writeManifest(dir, manifest);
      const content = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
      expect(content.source).toBe("urls");
      expect(content).not.toHaveProperty("old");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseExportArgs, runExport } from "./main";

describe("parseExportArgs", () => {
  test("uses defaults", () => {
    const args = parseExportArgs(["--urls", "https://x.com/a/status/1"]);
    expect(args.downloadMedia).toBe(true);
    expect(args.outputDir.endsWith("x-toolkit-output")).toBe(true);
    expect(args.urls).toEqual(["https://x.com/a/status/1"]);
  });

  test("parses output and no-download-media", () => {
    const args = parseExportArgs([
      "--urls",
      "https://x.com/a/status/1",
      "https://x.com/b/status/2",
      "--output",
      "/tmp/demo",
      "--no-download-media",
    ]);

    expect(args.urls).toEqual([
      "https://x.com/a/status/1",
      "https://x.com/b/status/2",
    ]);
    expect(args.outputDir).toBe(path.resolve("/tmp/demo"));
    expect(args.downloadMedia).toBe(false);
  });
});

describe("runExport", () => {
  test("exports markdown and writes per-tweet output", async () => {
    const outdir = await mkdtemp(path.join(tmpdir(), "x-to-md-"));

    const summary = await runExport(
      ["--urls", "https://x.com/alice/status/123", "--output", outdir],
      {
        tweetToMarkdownImpl: async () => `---
url: "https://x.com/alice/status/123"
authorUsername: "alice"
---

# Hello thread

English body with enough content.`,
        localizeMarkdownMediaImpl: async (markdown) => ({
          markdown,
          downloadedImages: 0,
          downloadedVideos: 0,
          imageDir: null,
          videoDir: null,
        }),
      },
    );

    expect(summary).toEqual({ success: 1, skipped: 0, failed: 0 });

    const children = (await readdir(outdir)).filter((c) => c !== "manifest.json");
    expect(children.length).toBe(1);
    const itemDir = path.join(outdir, children[0]!);
    const markdown = await readFile(path.join(itemDir, "123.md"), "utf8");
    expect(markdown).toContain("# Hello thread");
    expect(markdown).toContain("English body");

    const manifest = JSON.parse(await readFile(path.join(outdir, "manifest.json"), "utf8"));
    expect(manifest.source).toBe("urls");
    expect(manifest.newFiles).toHaveLength(1);
    expect(manifest.newFiles[0].tweetId).toBe("123");
  });

  test("skips when markdown already exists for tweet id", async () => {
    const outdir = await mkdtemp(path.join(tmpdir(), "x-to-md-"));
    const existingDir = path.join(outdir, "20260225-100000-demo-alice-123");
    await mkdir(existingDir, { recursive: true });
    await writeFile(path.join(existingDir, "123.md"), "# existing", "utf8");

    let calls = 0;
    const summary = await runExport(
      ["--urls", "https://x.com/alice/status/123", "--output", outdir],
      {
        tweetToMarkdownImpl: async () => {
          calls += 1;
          return "# should-not-run";
        },
      },
    );

    expect(summary).toEqual({ success: 0, skipped: 1, failed: 0 });
    expect(calls).toBe(0);

    const manifest = JSON.parse(await readFile(path.join(outdir, "manifest.json"), "utf8"));
    expect(manifest.source).toBe("urls");
    expect(manifest.skipped).toEqual(["123"]);
    expect(manifest.newFiles).toHaveLength(0);
  });
});

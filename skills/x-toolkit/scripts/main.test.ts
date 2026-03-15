import { describe, expect, test } from "bun:test";
import { parseMainArgs, runMain } from "./main";

describe("parseMainArgs", () => {
  test("routes to tweet export when urls are provided", () => {
    const parsed = parseMainArgs(["--urls", "https://x.com/a/status/1"]);
    expect(parsed.mode).toBe("tweets");
    expect(parsed.argv).toEqual(["--urls", "https://x.com/a/status/1"]);
  });

  test("strips the explicit mode flag from forwarded argv", () => {
    const parsed = parseMainArgs(["--mode", "bookmarks", "--all"]);
    expect(parsed.mode).toBe("bookmarks");
    expect(parsed.argv).toEqual(["--all"]);
  });
});

describe("runMain", () => {
  test("skips interaction and runs tweet export when urls are present", async () => {
    let bookmarksCalls = 0;
    let debugCalls = 0;
    let exportCalls = 0;

    await runMain(["--urls", "https://x.com/a/status/1"], {
      askMode: async () => {
        throw new Error("askMode should not be called");
      },
      runBookmarksExportImpl: async () => {
        bookmarksCalls += 1;
        return { success: 0, skipped: 0, failed: 0 };
      },
      runDebugImpl: async () => {
        debugCalls += 1;
      },
      runTweetExportImpl: async () => {
        exportCalls += 1;
        return { success: 1, skipped: 0, failed: 0 };
      },
    });

    expect(bookmarksCalls).toBe(0);
    expect(debugCalls).toBe(0);
    expect(exportCalls).toBe(1);
  });

  test("runs bookmarks export when interactive mode selects bookmarks", async () => {
    let bookmarksCalls = 0;

    await runMain(["--all"], {
      askMode: async () => "bookmarks",
      runBookmarksExportImpl: async (argv) => {
        bookmarksCalls += 1;
        expect(argv).toEqual(["--all"]);
        return { success: 1, skipped: 0, failed: 0 };
      },
      runDebugImpl: async () => {
        throw new Error("debug should not run");
      },
      runTweetExportImpl: async () => {
        throw new Error("tweet export should not run");
      },
    });

    expect(bookmarksCalls).toBe(1);
  });

  test("runs debug when interactive mode selects debug", async () => {
    let debugCalls = 0;

    await runMain(["--count", "5"], {
      askMode: async () => "debug",
      runBookmarksExportImpl: async () => {
        throw new Error("bookmarks export should not run");
      },
      runDebugImpl: async (argv) => {
        debugCalls += 1;
        expect(argv).toEqual(["--count", "5"]);
      },
      runTweetExportImpl: async () => {
        throw new Error("tweet export should not run");
      },
    });

    expect(debugCalls).toBe(1);
  });
});

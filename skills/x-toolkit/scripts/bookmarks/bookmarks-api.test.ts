import { describe, expect, test } from "bun:test";
import { extractBookmarksQueryInfo, resolveBookmarksApiChunkUrl } from "./bookmarks-api";

describe("extractBookmarksQueryInfo", () => {
  test("extracts Bookmarks query id", () => {
    const info = extractBookmarksQueryInfo("queryId:\"abc\",operationName:\"Bookmarks\"");
    expect(info.queryId).toBe("abc");
  });
});

describe("resolveBookmarksApiChunkUrl", () => {
  test("falls back to shared bookmarks chunk", () => {
    const html = "\"shared~bundle.BookmarkFolders~bundle.Bookmarks\":\"0fe48ba\"";
    expect(resolveBookmarksApiChunkUrl(html)).toContain(
      "shared~bundle.BookmarkFolders~bundle.Bookmarks.0fe48baa.js"
    );
  });
});

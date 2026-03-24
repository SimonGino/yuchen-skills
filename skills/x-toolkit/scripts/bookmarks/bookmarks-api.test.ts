import { describe, expect, test } from "bun:test";
import { extractBookmarksQueryInfo } from "./bookmarks-api";

describe("extractBookmarksQueryInfo", () => {
  test("extracts Bookmarks query id and operationName", () => {
    const js = `queryId:"abc",operationName:"Bookmarks",metadata:{featureSwitches:["feat1"],fieldToggles:["tog1"]}`;
    const info = extractBookmarksQueryInfo(js);
    expect(info).not.toBeNull();
    expect(info!.queryId).toBe("abc");
    expect(info!.operationName).toBe("Bookmarks");
    expect(info!.featureSwitches).toEqual(["feat1"]);
    expect(info!.fieldToggles).toEqual(["tog1"]);
  });

  test("falls back to BookmarkFolderTimeline if Bookmarks not found", () => {
    const js = `queryId:"xyz",operationName:"BookmarkFolderTimeline",metadata:{featureSwitches:[],fieldToggles:[]}`;
    const info = extractBookmarksQueryInfo(js);
    expect(info).not.toBeNull();
    expect(info!.queryId).toBe("xyz");
    expect(info!.operationName).toBe("BookmarkFolderTimeline");
  });

  test("returns null when no matching operation found", () => {
    const info = extractBookmarksQueryInfo("some random js content");
    expect(info).toBeNull();
  });
});

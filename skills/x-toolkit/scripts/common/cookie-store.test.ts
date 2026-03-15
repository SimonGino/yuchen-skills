import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readCookieFile, writeCookieFile } from "./cookie-store";

describe("cookie-store", () => {
  test("reads v1 cookieMap format", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cookie-store-"));
    const file = path.join(dir, "cookies.json");
    writeFileSync(file, JSON.stringify({ version: 1, cookieMap: { auth_token: "a", ct0: "b" } }), "utf8");
    const out = await readCookieFile(file);
    expect(out?.auth_token).toBe("a");
    expect(out?.ct0).toBe("b");
  });
});

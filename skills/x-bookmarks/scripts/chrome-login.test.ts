import { describe, expect, test } from "bun:test";
import { loadXCookiesFromBrowserLogin, normalizeBrowserCookiePayload } from "./chrome-login";

describe("chrome-login", () => {
  test("normalizes supported cookie keys", () => {
    const out = normalizeBrowserCookiePayload({
      auth_token: "auth",
      ct0: "token",
      ignore: "value",
      gt: "guest",
    });
    expect(out.auth_token).toBe("auth");
    expect(out.ct0).toBe("token");
    expect(out.gt).toBe("guest");
    expect(out.ignore).toBeUndefined();
  });

  test("returns empty cookie map when browser login command fails", async () => {
    const out = await loadXCookiesFromBrowserLogin(undefined, {
      spawnSync: () => ({
        exitCode: 1,
        stdout: new Uint8Array(),
        stderr: new TextEncoder().encode("failed"),
      }),
    });
    expect(out).toEqual({});
  });
});

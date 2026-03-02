import { describe, expect, test } from "bun:test";
import { buildCookieHeader, hasRequiredXCookies, loadXCookies, refreshXCookies } from "./cookies";

describe("cookies", () => {
  test("checks required cookies", () => {
    expect(hasRequiredXCookies({ auth_token: "a", ct0: "b" })).toBe(true);
  });

  test("builds cookie header", () => {
    expect(buildCookieHeader({ auth_token: "a", ct0: "b" })).toContain("auth_token=a");
  });

  test("loads cookies from env", async () => {
    process.env.X_AUTH_TOKEN = "env-auth";
    process.env.X_CT0 = "env-ct0";
    try {
      const cookieMap = await loadXCookies();
      expect(cookieMap.auth_token).toBe("env-auth");
      expect(cookieMap.ct0).toBe("env-ct0");
    } finally {
      delete process.env.X_AUTH_TOKEN;
      delete process.env.X_CT0;
    }
  });

  test("falls back to browser cookie loader when env is missing", async () => {
    delete process.env.X_AUTH_TOKEN;
    delete process.env.X_CT0;
    delete process.env.AUTH_TOKEN;
    delete process.env.CT0;
    delete process.env.X_COOKIE_HEADER;
    delete process.env.X_COOKIES;

    const cookieMap = await loadXCookies(undefined, {
      loadFromBrowser: async () => ({ auth_token: "browser-auth", ct0: "browser-ct0" }),
      readFromFile: async () => null,
      cookiePath: "/tmp/cookies-not-used.json",
    });

    expect(cookieMap.auth_token).toBe("browser-auth");
    expect(cookieMap.ct0).toBe("browser-ct0");
  });

  test("refreshXCookies uses interactive loader and returns required cookies", async () => {
    const map = await refreshXCookies(undefined, {
      refreshFromBrowser: async () => ({ auth_token: "fresh-auth", ct0: "fresh-ct0" }),
      cookiePath: "/tmp/fake-cookies.json",
      writeToFile: async () => {},
    });
    expect(map.auth_token).toBe("fresh-auth");
    expect(map.ct0).toBe("fresh-ct0");
  });

  test("loadXCookies reads file before browser refresh", async () => {
    const map = await loadXCookies(undefined, {
      readFromFile: async () => ({ auth_token: "file-auth", ct0: "file-ct0" }),
      loadFromBrowser: async () => ({}),
    });
    expect(map.auth_token).toBe("file-auth");
  });
});

import { describe, expect, test } from "bun:test";
import {
  resolveXRuntimeDataDir,
  resolveXRuntimeCookiePath,
  resolveXRuntimeChromeProfileDir,
} from "./paths";

describe("x-runtime paths", () => {
  test("uses X_DATA_DIR override when provided", () => {
    const dataDir = resolveXRuntimeDataDir({
      env: { X_DATA_DIR: "/tmp/x-data" },
      platform: "darwin",
      homedir: "/Users/demo",
    });
    expect(dataDir).toBe("/tmp/x-data");
  });

  test("builds cookie and profile paths from data dir", () => {
    const env = { X_DATA_DIR: "/tmp/x-data" };
    expect(resolveXRuntimeCookiePath({ env, platform: "linux", homedir: "/home/demo" })).toBe("/tmp/x-data/cookies.json");
    expect(resolveXRuntimeChromeProfileDir({ env, platform: "linux", homedir: "/home/demo" })).toBe(
      "/tmp/x-data/chrome-profile"
    );
  });
});

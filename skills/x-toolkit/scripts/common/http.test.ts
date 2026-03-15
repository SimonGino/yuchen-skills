import { describe, expect, test } from "bun:test";
import { buildRequestHeaders } from "./http";

describe("buildRequestHeaders", () => {
  test("adds csrf and cookie headers", () => {
    const headers = buildRequestHeaders({ auth_token: "a", ct0: "b" });
    expect(headers["x-csrf-token"]).toBe("b");
    expect(headers.cookie).toContain("auth_token=a");
  });
});

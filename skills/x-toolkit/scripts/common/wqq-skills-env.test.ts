import { describe, it, expect } from "bun:test";
import {
  parseDotEnv,
  getWqqSkillsEnvFilePath,
  loadDotEnvFile,
  applyFileOnlyKeysToEnvObject,
} from "./wqq-skills-env";

describe("parseDotEnv", () => {
  it("should parse simple key=value pairs", () => {
    expect(parseDotEnv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("should skip comments and empty lines", () => {
    expect(parseDotEnv("# comment\n\nFOO=bar")).toEqual({ FOO: "bar" });
  });

  it("should handle export prefix", () => {
    expect(parseDotEnv("export FOO=bar")).toEqual({ FOO: "bar" });
  });

  it("should strip single and double quotes", () => {
    expect(parseDotEnv('FOO="bar"\nBAZ=\'qux\'')).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("should handle value with equals sign", () => {
    expect(parseDotEnv("URL=https://example.com?a=1&b=2")).toEqual({
      URL: "https://example.com?a=1&b=2",
    });
  });

  it("should skip lines without equals", () => {
    expect(parseDotEnv("NOEQ")).toEqual({});
  });

  it("should return empty object for empty input", () => {
    expect(parseDotEnv("")).toEqual({});
  });
});

describe("getWqqSkillsEnvFilePath", () => {
  it("should construct path under .wqq-skills", () => {
    const result = getWqqSkillsEnvFilePath("/home/user");
    expect(result).toBe("/home/user/.wqq-skills/.env");
  });
});

describe("loadDotEnvFile", () => {
  it("should return empty object for non-existent file", async () => {
    const result = await loadDotEnvFile("/tmp/does-not-exist-xyz/.env");
    expect(result).toEqual({});
  });
});

describe("applyFileOnlyKeysToEnvObject", () => {
  it("should override target keys from file env", () => {
    const target: Record<string, string | undefined> = { A: "old", B: "keep" };
    applyFileOnlyKeysToEnvObject(target, { A: "new" }, ["A"]);
    expect(target.A).toBe("new");
    expect(target.B).toBe("keep");
  });

  it("should set undefined for keys not in file env", () => {
    const target: Record<string, string | undefined> = { A: "old" };
    applyFileOnlyKeysToEnvObject(target, {}, ["A"]);
    expect(target.A).toBeUndefined();
  });
});

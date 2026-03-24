import { describe, expect, test } from "bun:test";
import { parseExportArgs } from "./main";

describe("parseExportArgs", () => {
  test("uses defaults", () => {
    const args = parseExportArgs([]);
    expect(args.limit).toBe(50);
    expect(args.all).toBe(false);
    expect(args.downloadMedia).toBe(true);
  });

  test("parses limit and no-download-media", () => {
    const args = parseExportArgs(["--limit", "10", "--no-download-media"]);
    expect(args.limit).toBe(10);
    expect(args.downloadMedia).toBe(false);
  });

  test("parses --all flag", () => {
    const args = parseExportArgs(["--all"]);
    expect(args.all).toBe(true);
    expect(args.limit).toBe(Infinity);
  });

  test("--all overrides --limit", () => {
    const args = parseExportArgs(["--limit", "10", "--all"]);
    expect(args.all).toBe(true);
    expect(args.limit).toBe(Infinity);
  });

  test("parses --since flag", () => {
    const args = parseExportArgs(["--since", "2026-02-01"]);
    expect(args.since).toBe("2026-02-01");
  });

  test("rejects invalid --since format", () => {
    expect(() => parseExportArgs(["--since", "yesterday"])).toThrow("--since must be YYYY-MM-DD format");
    expect(() => parseExportArgs(["--since", "2026/02/01"])).toThrow("--since must be YYYY-MM-DD format");
  });
});

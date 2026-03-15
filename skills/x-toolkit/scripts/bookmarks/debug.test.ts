import { describe, expect, test } from "bun:test";
import { parseDebugArgs } from "./debug";

describe("parseDebugArgs", () => {
  test("uses defaults", () => {
    const args = parseDebugArgs([]);
    expect(args.count).toBe(20);
    expect(args.saveRaw).toBe(false);
  });

  test("parses count and save raw", () => {
    const args = parseDebugArgs(["--count", "10", "--save-raw"]);
    expect(args.count).toBe(10);
    expect(args.saveRaw).toBe(true);
  });
});

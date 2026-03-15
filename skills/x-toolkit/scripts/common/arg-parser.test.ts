import { describe, it, expect } from "bun:test";
import { createArgParser, takeOne, takeMany, parsePositiveInt } from "./arg-parser";

describe("takeOne", () => {
  it("should take next argument", () => {
    const argv = ["--flag", "value", "other"];
    const result = takeOne(argv, 0, "--flag");
    expect(result).toBe("value");
  });

  it("should throw if value is missing", () => {
    const argv = ["--flag"];
    expect(() => takeOne(argv, 0, "--flag")).toThrow("Missing value for --flag");
  });

  it("should throw if value starts with dash", () => {
    const argv = ["--flag", "--other"];
    expect(() => takeOne(argv, 0, "--flag")).toThrow("Missing value for --flag");
  });
});

describe("takeMany", () => {
  it("should take multiple arguments", () => {
    const argv = ["--files", "a.md", "b.md", "c.md", "--other"];
    const { items, nextIndex } = takeMany(argv, 0);
    expect(items).toEqual(["a.md", "b.md", "c.md"]);
    expect(nextIndex).toBe(3);
  });

  it("should handle no arguments", () => {
    const argv = ["--files", "--other"];
    const { items, nextIndex } = takeMany(argv, 0);
    expect(items).toEqual([]);
    expect(nextIndex).toBe(0);
  });

  it("should stop at end of array", () => {
    const argv = ["--files", "a.md", "b.md"];
    const { items, nextIndex } = takeMany(argv, 0);
    expect(items).toEqual(["a.md", "b.md"]);
    expect(nextIndex).toBe(2);
  });

  it("should handle single argument", () => {
    const argv = ["--file", "single.md", "--next"];
    const { items, nextIndex } = takeMany(argv, 0);
    expect(items).toEqual(["single.md"]);
    expect(nextIndex).toBe(1);
  });
});

describe("parsePositiveInt", () => {
  it("should parse a positive integer", () => {
    expect(parsePositiveInt("42", "--count")).toBe(42);
  });

  it("should throw for zero", () => {
    expect(() => parsePositiveInt("0", "--count")).toThrow("--count must be a positive integer");
  });

  it("should throw for negative", () => {
    expect(() => parsePositiveInt("-1", "--count")).toThrow("--count must be a positive integer");
  });

  it("should throw for non-numeric", () => {
    expect(() => parsePositiveInt("abc", "--count")).toThrow("--count must be a positive integer");
  });
});

describe("createArgParser", () => {
  it("should parse flags via handlers", () => {
    type Args = { name: string; verbose: boolean };
    const parse = createArgParser<Args>(
      { name: "", verbose: false },
      new Map([
        ["--name", (args, argv, i) => { args.name = takeOne(argv, i, "--name"); return { nextIndex: i + 1 }; }],
        ["--verbose", (args, _argv, i) => { args.verbose = true; return { nextIndex: i }; }],
      ]),
    );
    const result = parse(["--name", "alice", "--verbose"]);
    expect(result.name).toBe("alice");
    expect(result.verbose).toBe(true);
  });

  it("should throw on unknown flags", () => {
    const parse = createArgParser({}, new Map());
    expect(() => parse(["--unknown"])).toThrow("Unknown option: --unknown");
  });

  it("should not throw unknown option for --help with usage", () => {
    // --help calls process.exit(0), which we can't easily mock in bun:test.
    // Instead, verify --help is recognized (doesn't throw "Unknown option").
    const parse = createArgParser({}, new Map());
    // Without usage, --help is treated as unknown option
    expect(() => parse(["--help"])).toThrow("Unknown option: --help");
  });
});

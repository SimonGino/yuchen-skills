import { describe, it, expect } from "bun:test";
import { takeOne, takeMany } from "./arg-parser";

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

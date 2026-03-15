import { describe, expect, test } from "bun:test";
import { resolveOpenAiApiFormat } from "./openai-format";

describe("resolveOpenAiApiFormat", () => {
  test("returns 'responses' when OPENAI_API_FORMAT is 'responses'", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "responses" } as NodeJS.ProcessEnv)).toBe("responses");
  });

  test("returns 'chat' when OPENAI_API_FORMAT is 'chat'", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "chat" } as NodeJS.ProcessEnv)).toBe("chat");
  });

  test("returns 'auto' when OPENAI_API_FORMAT is 'auto'", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "auto" } as NodeJS.ProcessEnv)).toBe("auto");
  });

  test("returns 'auto' when OPENAI_API_FORMAT is not set", () => {
    expect(resolveOpenAiApiFormat({} as NodeJS.ProcessEnv)).toBe("auto");
  });

  test("trims and lowercases the value", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "  Chat  " } as NodeJS.ProcessEnv)).toBe("chat");
  });

  test("returns 'auto' for unknown values", () => {
    expect(resolveOpenAiApiFormat({ OPENAI_API_FORMAT: "invalid" } as NodeJS.ProcessEnv)).toBe("auto");
  });
});

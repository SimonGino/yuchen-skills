export type OpenAiApiFormat = "responses" | "chat" | "auto";

export function resolveOpenAiApiFormat(env: NodeJS.ProcessEnv): OpenAiApiFormat {
  const raw = env.OPENAI_API_FORMAT?.trim().toLowerCase();
  if (raw === "responses" || raw === "chat") return raw;
  return "auto";
}

import { DEFAULT_BEARER_TOKEN, DEFAULT_USER_AGENT } from "../../shared/x-runtime/constants";
import {
  buildFeatureMap,
  buildFieldToggleMap,
  buildRequestHeaders,
  fetchHomeHtml,
  fetchText,
  parseStringList,
} from "../../shared/x-runtime/http";

type FetchBookmarksPageParams = {
  cookieMap: Record<string, string>;
  count: number;
  cursor?: string;
  userAgent?: string;
  bearerToken?: string;
};

type BookmarksQueryInfo = {
  queryId: string;
  featureSwitches: string[];
  fieldToggles: string[];
};

export class HttpStatusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

function parseBookmarksApiHash(html: string): string {
  return (
    html.match(/api:\"([a-zA-Z0-9_-]+)\"/)?.[1] ??
    html.match(/\"api\":\"([a-zA-Z0-9_-]+)\"/)?.[1] ??
    ""
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  return error instanceof HttpStatusError && isRetryableStatus(error.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveBookmarksApiChunkUrl(html: string): string {
  const apiHash = parseBookmarksApiHash(html);
  if (apiHash) {
    return `https://abs.twimg.com/responsive-web/client-web/api.${apiHash}a.js`;
  }

  const sharedHash = html.match(/\"shared~bundle\.BookmarkFolders~bundle\.Bookmarks\":\"([a-z0-9]+)\"/)?.[1];
  if (sharedHash) {
    return `https://abs.twimg.com/responsive-web/client-web/shared~bundle.BookmarkFolders~bundle.Bookmarks.${sharedHash}a.js`;
  }

  const bookmarksHash = html.match(/\"bundle\.Bookmarks\":\"([a-z0-9]+)\"/)?.[1];
  if (bookmarksHash) {
    return `https://abs.twimg.com/responsive-web/client-web/bundle.Bookmarks.${bookmarksHash}a.js`;
  }

  throw new Error("Bookmarks chunk hash not found");
}

export function extractBookmarksQueryInfo(apiChunk: string): BookmarksQueryInfo {
  const queryMatch = apiChunk.match(/queryId:\"([^\"]+)\",operationName:\"Bookmarks\"/);
  if (!queryMatch?.[1]) {
    throw new Error("Bookmarks queryId not found");
  }

  const featureSwitches = parseStringList(
    apiChunk.match(/operationName:\"Bookmarks\"[\s\S]*?featureSwitches:\[(.*?)\]/)?.[1]
  );
  const fieldToggles = parseStringList(
    apiChunk.match(/operationName:\"Bookmarks\"[\s\S]*?fieldToggles:\[(.*?)\]/)?.[1]
  );

  return {
    queryId: queryMatch[1],
    featureSwitches,
    fieldToggles,
  };
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryableError(error)) {
        throw error;
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
}

async function fetchBookmarksPageOnce(params: FetchBookmarksPageParams): Promise<unknown> {
  const userAgent = params.userAgent?.trim() || process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const bearerToken = params.bearerToken?.trim() || process.env.X_BEARER_TOKEN?.trim() || DEFAULT_BEARER_TOKEN;

  const html = await fetchHomeHtml(userAgent);
  const chunkUrl = resolveBookmarksApiChunkUrl(html);
  const apiChunk = await fetchText(chunkUrl, {
    headers: { "user-agent": userAgent },
  });
  const queryInfo = extractBookmarksQueryInfo(apiChunk);
  const features = buildFeatureMap(html, queryInfo.featureSwitches);
  const fieldToggles = buildFieldToggleMap(queryInfo.fieldToggles);

  const url = new URL(`https://x.com/i/api/graphql/${queryInfo.queryId}/Bookmarks`);
  const variables: Record<string, unknown> = {
    count: params.count,
    includePromotedContent: false,
  };
  if (params.cursor) {
    variables.cursor = params.cursor;
  }

  url.searchParams.set("variables", JSON.stringify(variables));
  if (Object.keys(features).length > 0) {
    url.searchParams.set("features", JSON.stringify(features));
  }
  if (Object.keys(fieldToggles).length > 0) {
    url.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));
  }

  const response = await fetch(url.toString(), {
    headers: buildRequestHeaders(params.cookieMap, userAgent, bearerToken),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpStatusError(response.status, `Bookmarks API error (${response.status}): ${text.slice(0, 400)}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bookmarks response is not valid JSON: ${message}`);
  }
}

export async function fetchBookmarksPage(params: FetchBookmarksPageParams): Promise<unknown> {
  return withRetry(() => fetchBookmarksPageOnce(params));
}

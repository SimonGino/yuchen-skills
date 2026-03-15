import { DEFAULT_BEARER_TOKEN, DEFAULT_USER_AGENT } from "../common/constants";
import {
  buildFeatureMap,
  buildFieldToggleMap,
  buildRequestHeaders,
  fetchHomeHtml,
  fetchText,
  HttpStatusError,
  parseStringList,
} from "../common/http";
import { retryWithBackoff } from "../common/retry";
import type { XCookieMap } from "../common/x-types";

export { HttpStatusError };

type FetchBookmarksPageParams = {
  cookieMap: XCookieMap;
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

function parseBookmarksApiHash(html: string): string {
  return html.match(/api:\"([a-zA-Z0-9_-]+)\"/)?.[1] ?? html.match(/\"api\":\"([a-zA-Z0-9_-]+)\"/)?.[1] ?? "";
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
    apiChunk.match(/operationName:\"Bookmarks\"[\s\S]*?featureSwitches:\[(.*?)\]/)?.[1],
  );
  const fieldToggles = parseStringList(
    apiChunk.match(/operationName:\"Bookmarks\"[\s\S]*?fieldToggles:\[(.*?)\]/)?.[1],
  );

  return {
    queryId: queryMatch[1],
    featureSwitches,
    fieldToggles,
  };
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
  return retryWithBackoff(() => fetchBookmarksPageOnce(params), {
    maxAttempts: 5,
    delayMs: 10_000,
    backoffFactor: 3,
    isRetryable: (err) => err instanceof HttpStatusError && (err.status === 429 || err.status >= 500),
    onRetry: (err, attempt) => {
      console.log(`[bookmarks-api] retry ${attempt}: ${err.message}`);
    },
  });
}

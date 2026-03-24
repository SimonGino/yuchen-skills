import { DEFAULT_BEARER_TOKEN, DEFAULT_USER_AGENT, FALLBACK_BOOKMARKS_QUERY_ID, FALLBACK_BOOKMARKS_FEATURE_SWITCHES, FALLBACK_BOOKMARKS_FIELD_TOGGLES } from "../common/constants";
import { resolveMainChunkUrl } from "../common/graphql";
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
  operationName: string;
  featureSwitches: string[];
  fieldToggles: string[];
};

/**
 * Extract Bookmarks query info from main.js bundle.
 * Tries "Bookmarks" first (lazy chunk may have been inlined), then falls back to "BookmarkFolderTimeline".
 */
export function extractBookmarksQueryInfo(mainJs: string): BookmarksQueryInfo | null {
  // Try the classic Bookmarks endpoint first
  for (const opName of ["Bookmarks", "BookmarkFolderTimeline"]) {
    const queryMatch = mainJs.match(new RegExp(`queryId:"([^"]+)",operationName:"${opName}"`));
    if (!queryMatch?.[1]) continue;

    const modulePattern = new RegExp(
      `queryId:"${queryMatch[1]}",operationName:"${opName}"[^}]*metadata:\\{featureSwitches:\\[([^\\]]*?)\\],fieldToggles:\\[([^\\]]*?)\\]`
    );
    const moduleMatch = mainJs.match(modulePattern);
    const featureSwitches = moduleMatch?.[1] ? parseStringList(moduleMatch[1]) : [];
    const fieldToggles = moduleMatch?.[2] ? parseStringList(moduleMatch[2]) : [];

    return { queryId: queryMatch[1], operationName: opName, featureSwitches, fieldToggles };
  }

  return null;
}

/**
 * Try multiple queryIds for the Bookmarks endpoint since X rotates them.
 * The Bookmarks query is now in a lazy-loaded chunk, so we can't always extract it from main.js.
 */
async function fetchBookmarksQueryInfo(html: string, userAgent: string): Promise<BookmarksQueryInfo> {
  // 1. Try to extract from main.js
  const mainJsUrl = resolveMainChunkUrl(html);
  if (mainJsUrl) {
    try {
      const mainJs = await fetchText(mainJsUrl, { headers: { "user-agent": userAgent } });
      const info = extractBookmarksQueryInfo(mainJs);
      if (info) return info;
    } catch (err) {
      console.log(`[bookmarks-api] main.js extraction failed, using fallback: ${err}`);
    }
  }

  // 2. Fallback: use known queryId
  return {
    queryId: FALLBACK_BOOKMARKS_QUERY_ID,
    operationName: "Bookmarks",
    featureSwitches: FALLBACK_BOOKMARKS_FEATURE_SWITCHES,
    fieldToggles: FALLBACK_BOOKMARKS_FIELD_TOGGLES,
  };
}

async function fetchBookmarksPageOnce(params: FetchBookmarksPageParams): Promise<unknown> {
  const userAgent = params.userAgent?.trim() || process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const bearerToken = params.bearerToken?.trim() || process.env.X_BEARER_TOKEN?.trim() || DEFAULT_BEARER_TOKEN;

  const html = await fetchHomeHtml(userAgent);
  const queryInfo = await fetchBookmarksQueryInfo(html, userAgent);

  const features = buildFeatureMap(html, queryInfo.featureSwitches, {
    graphql_timeline_v2_bookmark_timeline: true,
  });
  const fieldToggles = buildFieldToggleMap(queryInfo.fieldToggles);

  const url = new URL(`https://x.com/i/api/graphql/${queryInfo.queryId}/${queryInfo.operationName}`);
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

# Codebase Optimization Design

Date: 2026-03-04

## Overview

对仓库进行 6 项系统性优化：去重、统一工具、核心类型定义、补充测试、小修复、结构改进。

执行顺序：方案 A（自底向上）— 先稳固共享模块，再写测试锁定最终行为。

```
去重 → 类型定义 → 采纳工具 → 小修复 → 补测试 → 结构改进
```

---

## 1. 去重：新建共享工具文件

### 1.1 新建 `shared/x-runtime/tweet-utils.ts`

| 函数 | 来源 | 合并策略 |
|------|------|---------|
| `unwrapTweetResult` | 5 处，两个变体 | 采用 Variant 2（`result?.tweet ?? result`），更宽容的 unwrap 策略 |
| `pickTweetText` | 2 处，有差异 | 统一为带 `expandTcoUrls` 的版本（tweet-detail.ts），bookmarks-parser 也享受 URL 展开 |
| `pickUsername` | 2 处，完全相同 | 直接提取 |
| `pickMediaUrls` | 2 处，逻辑相同 | 直接提取 |
| `formatMetaMarkdown` | 2 处，完全相同 | 直接提取 |

### 1.2 新建 `shared/x-runtime/url-utils.ts`

| 函数 | 来源 | 合并策略 |
|------|------|---------|
| `parseTweetId` | 3 处，逻辑相同 | 统一名称为 `parseTweetId`，x-to-md 的 `parseTweetIdFromUrl` 改为 import |

### 1.3 保持现状（不合并）

| 函数 | 原因 |
|------|------|
| `resolveTweetQueryChunkUrl` | graphql.ts 版本多一个 inline URL 正则；tweet-detail.ts 版本更简化。服务不同场景 |
| `buildTweetDetailFieldToggleMap` / `buildTweetFieldToggles` | 各自覆盖不同 toggle 数量（3 vs 2），对应不同 GraphQL 操作，差异有意为之 |

---

## 2. 统一采纳工具

### 2.1 增强 `shared/retry.ts`

给 `retryWithBackoff` 加 `isRetryable` 选项：

```ts
interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
  onRetry?: (error: Error, attempt: number) => void;
  isRetryable?: (error: Error) => boolean;  // 新增
}
```

catch 块中，如果 `isRetryable` 返回 `false`，立即抛出不重试。

`bookmarks-api.ts` 的 `withRetry` 替换为：

```ts
retryWithBackoff(fn, {
  maxAttempts: 4,
  isRetryable: (err) => err instanceof HttpStatusError && (err.status === 429 || err.status >= 500),
});
```

删除 `bookmarks-api.ts` 中的 `withRetry` 和 `isRetryableError`。

### 2.2 增强 `shared/arg-parser.ts` 并迁移

增强点：
- 加 `--help` / `-h` 内置支持（传入 `usage` 字符串自动处理）
- 加 `parsePositiveInt` 工具函数

迁移 3 个脚本到 `createArgParser`：
- `x-bookmarks/scripts/main.ts`（`parseExportArgs`）
- `x-bookmarks/scripts/debug.ts`（`parseDebugArgs`）
- `x-to-md/scripts/main.ts`（`parseExportArgs`）

Post-parse 校验仍在调用方做。

---

## 3. 核心类型定义（渐进式减少 any）

在 `shared/x-runtime/types.ts` 中添加：

```ts
interface TweetResult {
  __typename?: string;
  tweet?: TweetLegacy;
  rest_id?: string;
  core?: { user_results?: { result?: { legacy?: UserLegacy } } };
  legacy?: TweetLegacy;
  note_tweet?: { note_tweet_results?: { result?: { text?: string } } };
}

interface TweetLegacy {
  full_text?: string;
  text?: string;
  screen_name?: string;
  extended_entities?: { media?: MediaEntity[] };
  entities?: { media?: MediaEntity[]; urls?: UrlEntity[] };
}

interface MediaEntity {
  type?: string;
  media_url_https?: string;
  media_url?: string;
  video_info?: { variants?: VideoVariant[] };
}

interface BookmarkTimelineResponse {
  data?: {
    bookmark_timeline_v2?: {
      timeline?: { instructions?: TimelineInstruction[] };
    };
  };
}
```

应用范围：
- `unwrapTweetResult` → 参数和返回值改为 `TweetResult | null`
- `pickTweetText` / `pickUsername` / `pickMediaUrls` → 参数改为 `TweetResult`
- `bookmarks-parser.ts` → 用 `BookmarkTimelineResponse`

不覆盖：GraphQL 动态解析、thread 分页等深层结构暂不加类型。

---

## 4. 小修复

- `tweet-to-markdown.ts:183` 的旧路径引用 → 更新为当前正确路径
- `http.ts` 的 `cachedHomeHtml` → 加 TTL（5 分钟过期）
- `output.ts` 的 `shouldSkipTweetOutput` → 删除未使用的 `_markdownPath` 参数

---

## 5. 补充测试（纯单元测试）

| 模块 | 测试重点 | 预计 case 数 |
|------|---------|-------------|
| `wqq-skills-env.ts` | parseDotEnv 解析、FILE_ONLY_KEYS 屏蔽、缺失文件 | 6-8 |
| `media-localizer.ts` | URL 提取、扩展名推断、Markdown 重写、下载失败 | 8-10 |
| `fxtwitter.ts` | API 响应解析、错误处理 | 4-6 |
| `thread.ts` | 分页 cursor、self-thread 检测、空响应终止 | 5-7 |

测试风格：和现有测试保持一致，用 `bun:test`，DI mock 网络请求。

---

## 6. 结构改进

- 新建 `shared/x-runtime/index.ts` barrel 文件，统一导出常用 API
- `x-to-md` 和 `x-bookmarks` 的 summarize 逻辑暂不合并（输入格式和语言不同）

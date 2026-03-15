# shared-modules Specification

## Purpose
TBD - created by archiving change merge-x-skills. Update Purpose after archive.
## Requirements
### Requirement: 共享模块只保留一份代码
系统 SHALL 将原 x-bookmarks 和 x-to-md 中重复的 TypeScript 模块合并到 `scripts/common/` 目录下，每个模块只保留一份代码。

#### Scenario: 共享模块位于 common 目录
- **WHEN** 查看 `skills/x-toolkit/scripts/common/` 目录
- **THEN** 包含所有共享模块（cookies、http、graphql、markdown、media-localizer、tweet-utils、output、paths 等）

#### Scenario: 共享模块测试文件去重
- **WHEN** 查看测试文件
- **THEN** 每个共享模块的测试文件只存在一份，位于 `scripts/common/` 目录下

### Requirement: HTTP 客户端通过配置支持两种重试策略
合并后的 `http.ts` SHALL 统一保留 `HttpStatusError.retryAfterMs` 字段，并在所有场景下可用。不同模式通过构造参数控制是否解析 rate limit 响应头。

#### Scenario: 书签模式使用认证 API 的重试策略
- **WHEN** 书签导出流程调用 HTTP 客户端
- **THEN** 启用 429 rate limit 检测和 `retryAfterMs` 解析

#### Scenario: 推文导出模式使用公开 API 的重试策略
- **WHEN** 推文导出流程调用 HTTP 客户端
- **THEN** 使用轻量重试策略，不依赖 rate limit 响应头

### Requirement: GraphQL 客户端通过配置参数控制重试行为
合并后的 `graphql.ts` SHALL 接受 `RetryConfig` 参数，不同调用方传入各自的重试配置，而非硬编码。

#### Scenario: 书签 API 使用激进重试配置
- **WHEN** 书签导出调用 GraphQL 客户端
- **THEN** 使用 5 次重试、60 秒延迟、因子 2 的配置

#### Scenario: 推文导出使用轻量重试配置
- **WHEN** 推文导出调用 GraphQL 客户端
- **THEN** 使用 4 次重试、15 秒延迟、因子 3 的配置

### Requirement: 独有模块按功能分目录
书签导出独有模块（bookmarks-api、bookmarks-parser、state、debug、summary、tweet-detail）SHALL 位于 `scripts/bookmarks/` 目录。推文导出独有模块（summarize）SHALL 位于 `scripts/export/` 目录。

#### Scenario: 书签独有模块位于 bookmarks 目录
- **WHEN** 查看 `skills/x-toolkit/scripts/bookmarks/` 目录
- **THEN** 包含 bookmarks-api、bookmarks-parser、state、debug、summary、tweet-detail 及其测试文件

#### Scenario: 推文导出独有模块位于 export 目录
- **WHEN** 查看 `skills/x-toolkit/scripts/export/` 目录
- **THEN** 包含 summarize 及其测试文件

### Requirement: 删除旧 skill 目录
合并完成并通过全量测试后，系统 SHALL 删除 `skills/x-bookmarks/` 和 `skills/x-to-md/` 目录。

#### Scenario: 旧目录不再存在
- **WHEN** 合并完成后查看 `skills/` 目录
- **THEN** 不存在 `x-bookmarks` 和 `x-to-md` 目录，只有 `x-toolkit`


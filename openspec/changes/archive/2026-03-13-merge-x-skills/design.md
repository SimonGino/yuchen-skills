## Context

当前仓库中有两个 X/Twitter 相关 skill：

- **x-bookmarks**：通过认证 API 拉取用户书签，支持分页、游标恢复、状态管理、聚合摘要
- **x-to-md**：通过公开 fxtwitter API 将指定 URL 的推文导出为 Markdown，支持中文摘要

两者共享约 35 个 TypeScript 文件（cookies、HTTP、GraphQL、Markdown 格式化、媒体下载等），但以文件复制而非模块引用的方式存在。每次修改共享模块需要手动同步两份，CLAUDE.md 中有专门的警告提醒。

## Goals / Non-Goals

**Goals:**
- 消除 ~35 个重复文件，共享模块只保留一份
- 统一为一个 `x-toolkit` skill，用户无需区分两个 skill
- 通过输入参数自动判断操作模式，辅以 AskQuestion 交互
- 保留两种模式各自的功能完整性（认证/重试策略差异等）

**Non-Goals:**
- 不改变现有功能的行为逻辑（纯结构重组）
- 不引入新的外部 npm 依赖（遵循 MVP 原则）
- 不统一两种 API 策略（书签用认证 API，推文导出用 fxtwitter，各有各的优势）
- 不重构内部模块的接口设计（保持现有函数签名不变）

## Decisions

### 1. 目录结构：单一 skill 目录

**决定**：创建 `skills/x-toolkit/`，将所有代码放入 `scripts/` 子目录。

**替代方案**：保留两个 skill 但提取共享代码到 `skills/shared/`。
**否决原因**：违反「每个 skill 完全自包含」原则，且增加了模块引用的复杂度。合并为一个 skill 更简洁。

### 2. 代码组织：按职责分子目录

**决定**：在 `scripts/` 下按职责组织：

```
skills/x-toolkit/scripts/
├── common/          # 共享模块（cookies, http, graphql, markdown, media 等）
├── bookmarks/       # 书签导出独有模块（bookmarks-api, state, debug, summary 等）
├── export/          # 推文导出独有模块（summarize 等）
├── types.ts         # 统一类型定义
└── main.ts          # 统一入口
```

**替代方案**：所有文件平铺在 `scripts/` 下。
**否决原因**：文件数量多（~50 个），平铺难以区分共享和独有模块。

### 3. 入口路由：参数检测 + AskQuestion

**决定**：`main.ts` 检查是否传入了 `--urls` 参数：
- 有 URL → 直接走推文导出流程
- 无 URL → 使用 AskQuestion 询问用户意图（导出书签 / Debug 认证）

**替代方案**：使用子命令模式（`main.ts bookmarks`、`main.ts export`）。
**否决原因**：skill 通过 SKILL.md 触发，用户不直接输入子命令。参数检测 + 交互更符合 Claude Code skill 的使用模式。

### 4. HTTP/GraphQL 差异处理：配置化

**决定**：`http.ts` 和 `graphql.ts` 合并为共享版本，通过配置参数控制差异：
- `http.ts`：统一保留 `retryAfterMs` 字段（推文导出场景下不使用但不影响）
- `graphql.ts`：重试配置通过参数传入（`RetryConfig`），而非硬编码

**替代方案**：保留两个版本的文件。
**否决原因**：差异很小（仅重试参数不同），配置化更简洁。

### 5. 类型定义：合并为单一文件

**决定**：合并两个 `types.ts` 为一个，使用联合类型或可选字段区分模式：

```typescript
type ExportMode = 'bookmarks' | 'tweets'
type ExportArgs = {
  mode: ExportMode
  urls?: string[]        // 仅 tweets 模式
  limit?: number         // 仅 bookmarks 模式
  all?: boolean          // 仅 bookmarks 模式
  outputDir: string
  downloadMedia: boolean
  withSummary?: boolean  // 仅 bookmarks 模式
}
```

### 6. SKILL.md：合并触发条件

**决定**：新的 SKILL.md 合并两个 skill 的触发词，description 涵盖两种功能。skill 名称从 `wqq-x-bookmarks` / `wqq-x-to-md` 改为 `wqq-x-toolkit`。

## Risks / Trade-offs

- **[迁移期间功能中断]** → 分步迁移：先创建新 skill 并验证测试通过，再删除旧 skill
- **[git 历史丢失]** → 使用 `git mv` 尽量保留文件移动历史；对于合并的文件，在 commit message 中记录来源
- **[测试覆盖率下降]** → 迁移所有现有测试，合并后运行全量测试确认
- **[graphql.ts 合并引入回归]** → 两个版本差异已明确（仅重试参数），配置化后分别用各自参数调用，行为不变

## Why

当前 `wqq-wechat-skills` 和 `yuchen-skills` 是两个独立仓库，但共享相同的基础设施（`~/.wqq-skills/.env`、Bun 运行时、相同的项目原则）。X 相关 skill 已在 2026-03 从 wechat 仓库迁出到 yuchen-skills，现在应完成反向合并，将 wechat-article skill 搬入 yuchen-skills，实现统一管理。同时，`wqq-image-gen` skill 已被 `baoyu-skills`（如 `baoyu-cover-image`、`baoyu-infographic`）替代，应移除以减少维护负担。

## What Changes

- 将 `wqq-wechat-article` skill 从 `wqq-wechat-skills` 仓库迁入 `yuchen-skills/skills/wqq-wechat-article/`
- 迁入相关 references 目录（style-guide、compliance、tutorial-template、infographic-prompt-template）
- **不迁入** `wqq-image-gen` skill — 已被 baoyu-skills 系列替代
- 处理 `skills/shared/` 中的共享工具（`retry.ts`、`arg-parser.ts`、`wqq-skills-env.ts`）：评估是否内联到 wechat-article 中（与现有 x-bookmarks/x-to-md 的自包含模式保持一致）
- 更新 `CLAUDE.md` 项目文档，补充 wechat-article skill 的说明和运行命令
- 注册 wqq-wechat-article 的 `.claude/skills/` 配置

## Capabilities

### New Capabilities

- `wechat-article-migration`: 将 wqq-wechat-article skill 完整迁入 yuchen-skills，包括脚本、references、测试和 skill 注册

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **代码**：`skills/wqq-wechat-article/` 目录新增，包含脚本和 references
- **共享工具**：`retry.ts`、`arg-parser.ts`、`wqq-skills-env.ts` 需内联到 wechat-article 的 `scripts/` 中（符合本仓库"每个 skill 完全自包含"的架构原则）
- **环境变量**：两仓库已使用相同的 `~/.wqq-skills/.env`，无需调整路径。但需确认 wechat-article 所需的 key（`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`WQQ_PAST_ARTICLES_DIR`）在当前 `.env` 中已有或可选
- **依赖**：无新增 npm 依赖，保持 MVP 原则
- **测试**：迁入 `main.test.ts`、`workspace-ingest.test.ts`，确保 `bun run test` 覆盖新 skill
- **原仓库**：`wqq-wechat-skills` 可在迁移完成后归档

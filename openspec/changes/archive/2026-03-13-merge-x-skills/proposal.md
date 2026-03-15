## Why

`x-bookmarks` 和 `x-to-md` 两个 skill 共享约 35 个 TypeScript 文件（~1800+ 行重复代码），包括 cookies、HTTP 客户端、GraphQL、Markdown 格式化、媒体下载等核心模块。每次修改共享模块都必须手动同步两份代码，维护成本高且容易遗漏。两个 skill 本质上都是「X/Twitter 内容导出」，只是输入源不同（书签 vs URL），适合合并为一个统一 skill。

## What Changes

- **合并两个 skill 为一个 `x-toolkit` skill**：统一入口，通过输入自动判断操作模式
- **消除代码重复**：共享的 ~35 个模块只保留一份
- **智能路由**：有 URL 参数时走推文导出流程；无 URL 时通过 AskQuestion 询问用户意图（导出书签 / Debug 认证）
- **统一 SKILL.md 触发条件**：合并两个 skill 的触发词和描述
- **BREAKING**：删除 `skills/x-bookmarks/` 和 `skills/x-to-md/` 目录，替换为 `skills/x-toolkit/`
- 保留两套 retry/认证策略的差异（书签用认证 API + 激进重试，推文导出用 fxtwitter 公开 API + 轻量重试）

## Capabilities

### New Capabilities
- `unified-entry`: 统一入口与智能路由——根据输入参数（是否有 URL）和用户交互自动选择操作模式（推文导出 / 书签导出 / Debug）
- `shared-modules`: 共享模块去重——将重复的 TypeScript 模块合并为单一代码库，消除同步维护负担

### Modified Capabilities

（无已有 spec 需要修改）

## Impact

- **代码**：删除 `skills/x-bookmarks/` 和 `skills/x-to-md/` 两个目录，新建 `skills/x-toolkit/`
- **SKILL.md**：合并两个 skill 的触发条件为一个新的 SKILL.md
- **CLAUDE.md**：需要更新共享代码维护说明（不再需要「修改共享模块时必须同步更新两份」的警告）
- **package.json**：更新 test 脚本路径
- **测试**：所有现有测试迁移到新目录，去除重复的测试文件
- **用户行为**：用户无需区分两个 skill，统一使用 x-toolkit 即可

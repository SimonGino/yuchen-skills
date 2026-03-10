## Context

当前存在两个独立仓库：
- **yuchen-skills**：包含 `x-bookmarks`、`x-to-md`、`yt-monitor` 三个 skill，每个 skill 完全自包含（无 `skills/shared/`）
- **wqq-wechat-skills**：包含 `wqq-wechat-article`、`wqq-image-gen` 两个 skill，有 `skills/shared/` 共享目录

两仓库共享相同的基础设施：`~/.wqq-skills/.env` 环境变量、Bun 运行时、"不引入外部 npm 依赖"的 MVP 原则。X 相关 skill 已在 2026-03 从 wechat 仓库迁出到 yuchen-skills，现在需要完成反向合并。

## Goals / Non-Goals

**Goals:**
- 将 `wqq-wechat-article` skill 完整迁入 yuchen-skills，保持功能不变
- 移除 `wqq-image-gen` skill（已被 baoyu-skills 替代）
- 遵循 yuchen-skills 的"每个 skill 完全自包含"架构，将 shared 工具内联
- 确保测试通过

**Non-Goals:**
- 不优化 wechat-article 的生图流程（后续单独处理）
- 不修改 wechat-article 的业务逻辑
- 不归档或删除 wqq-wechat-skills 原仓库（迁移验证后手动处理）
- 不迁入 `design.md`（爆文公式）等非 skill 文档

## Decisions

### 1. 共享工具处理方式：内联到 skill 中

**选择**：将 `retry.ts`、`arg-parser.ts`、`wqq-skills-env.ts` 复制到 `skills/wqq-wechat-article/scripts/` 中

**理由**：yuchen-skills 已在 commit `be495ef` 中将 shared 目录内联到各 skill，确立了"每个 skill 完全自包含"的架构原则。新迁入的 skill 应遵循同样的模式。

**替代方案**：保留 `skills/shared/` 目录 → 会破坏现有架构一致性，且 x-bookmarks/x-to-md 已各自内联了相同的工具代码。

### 2. 环境变量：无需调整

**选择**：保持 `~/.wqq-skills/.env` 不变

**理由**：两仓库已经使用完全相同的 env 文件路径和加载方式。wechat-article 需要的 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL` 在 yuchen-skills 中已有使用。`WQQ_PAST_ARTICLES_DIR` 是可选配置，缺失时 wechat-article 会自动跳过历史文章步骤。

### 3. 不迁入 wqq-image-gen

**选择**：完全不迁入 `wqq-image-gen` skill

**理由**：用户已切换到 baoyu-skills（`baoyu-cover-image`、`baoyu-infographic` 等）进行图片生成。wqq-image-gen 使用 OpenAI DALL-E 和 Google Imagen API，功能已被替代。wechat-article 的 SKILL.md 中生图相关阶段（Phase 5-6）输出的是 prompt 文本文件，不依赖 wqq-image-gen 的代码。

### 4. Skill 注册

**选择**：在 `.claude/skills/` 中创建 `wqq-wechat-article` 的 skill 注册文件（从 wqq-wechat-skills 仓库复制并适配路径）

### 5. 迁移目标目录

**选择**：`skills/wqq-wechat-article/`（保持原 skill 名不变）

**理由**：skill 名已在 `.claude/skills/` 注册中使用，且与现有 skill 命名风格一致。

## Risks / Trade-offs

- **[Risk] 内联共享代码后的版本漂移** → 可接受，与现有 x-bookmarks/x-to-md 的做法一致。每个 skill 独立演进。
- **[Risk] wechat-article 的 references 文件较多（4个）** → 保持 `references/` 子目录结构，不影响 skill 自包含性。
- **[Risk] 原仓库的 smoke-test.sh 和 marketplace.json 不迁入** → 仅迁 skill 核心文件，这些基础设施文件在 yuchen-skills 中已有等效机制。

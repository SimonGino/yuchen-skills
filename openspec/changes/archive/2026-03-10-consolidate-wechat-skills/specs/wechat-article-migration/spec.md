## ADDED Requirements

### Requirement: wqq-wechat-article skill 迁入 yuchen-skills

系统 SHALL 将 `wqq-wechat-skills` 仓库中的 `wqq-wechat-article` skill 完整迁入 `yuchen-skills/skills/wqq-wechat-article/` 目录，保持所有功能不变。

#### Scenario: skill 目录结构完整

- **WHEN** 迁移完成后检查 `skills/wqq-wechat-article/` 目录
- **THEN** 目录包含 `SKILL.md`、`scripts/`（含 `main.ts`、`workspace-ingest.ts`、`types.ts` 及对应测试文件）、`references/`（含 `style-guide.md`、`compliance.md`、`tutorial-template.md`、`infographic-prompt-template.md`）

#### Scenario: 脚本可正常执行

- **WHEN** 运行 `npx -y bun skills/wqq-wechat-article/scripts/main.ts --help`
- **THEN** 输出帮助信息，包含 `--workspace`、`--sources`、`--summary`、`--outline`、`--outdir` 参数说明

### Requirement: 共享工具内联

系统 SHALL 将 `wqq-wechat-skills/skills/shared/` 中 wechat-article 依赖的模块（`retry.ts`、`arg-parser.ts`、`wqq-skills-env.ts`）内联到 `skills/wqq-wechat-article/scripts/` 目录中，并更新 import 路径。

#### Scenario: import 路径指向本地文件

- **WHEN** 检查 `skills/wqq-wechat-article/scripts/` 中所有 `.ts` 文件的 import 语句
- **THEN** 所有 import 路径 SHALL 指向 `scripts/` 目录内的本地文件，不存在 `../../shared/` 或外部路径引用

#### Scenario: 内联后功能不变

- **WHEN** 运行 `bun test skills/wqq-wechat-article/`
- **THEN** 所有测试通过

### Requirement: wqq-image-gen skill 不迁入

系统 SHALL NOT 迁入 `wqq-image-gen` skill。生图功能已由 baoyu-skills 系列（`baoyu-cover-image`、`baoyu-infographic` 等）替代。

#### Scenario: 仓库中不存在 image-gen 目录

- **WHEN** 检查 `skills/` 目录
- **THEN** 不存在 `wqq-image-gen` 目录

#### Scenario: wechat-article 不依赖 image-gen 代码

- **WHEN** 检查 `skills/wqq-wechat-article/` 中所有文件的 import 和引用
- **THEN** 不存在对 `wqq-image-gen` 的任何引用

### Requirement: Skill 注册

系统 SHALL 在 `.claude/skills/` 中注册 `wqq-wechat-article` skill，使其可通过 Claude Code 的 skill 系统触发。

#### Scenario: skill 注册文件存在

- **WHEN** 检查 `.claude/skills/wqq-wechat-article/` 目录
- **THEN** 存在有效的 skill 注册文件，包含触发词和 skill 描述

### Requirement: 项目文档更新

系统 SHALL 更新 `CLAUDE.md`，补充 wqq-wechat-article skill 的说明和运行命令。

#### Scenario: CLAUDE.md 包含 wechat-article 信息

- **WHEN** 阅读 `CLAUDE.md` 文件
- **THEN** 文件包含 wqq-wechat-article 的运行命令示例，格式与现有 skill 文档一致

### Requirement: 环境变量兼容

环境变量配置 SHALL 保持使用 `~/.wqq-skills/.env`，无需新增环境变量文件或修改加载路径。

#### Scenario: env 加载路径一致

- **WHEN** wechat-article skill 加载环境变量
- **THEN** 从 `~/.wqq-skills/.env` 读取，与其他 skill 使用相同路径

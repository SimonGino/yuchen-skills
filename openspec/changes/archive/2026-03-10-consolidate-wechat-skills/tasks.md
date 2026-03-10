## 1. 复制 skill 核心文件

- [x] 1.1 创建 `skills/wqq-wechat-article/` 目录结构（`scripts/`、`references/`）
- [x] 1.2 复制 `SKILL.md` 从 `wqq-wechat-skills/skills/wqq-wechat-article/SKILL.md`
- [x] 1.3 复制 `references/` 目录下全部 4 个文件（style-guide.md、compliance.md、tutorial-template.md、infographic-prompt-template.md）
- [x] 1.4 复制 `scripts/` 目录下的业务代码（main.ts、workspace-ingest.ts、types.ts）和测试文件（main.test.ts、workspace-ingest.test.ts）

## 2. 内联共享工具

- [x] 2.1 复制 `wqq-wechat-skills/skills/shared/retry.ts` 到 `skills/wqq-wechat-article/scripts/retry.ts`
- [x] 2.2 复制 `wqq-wechat-skills/skills/shared/arg-parser.ts` 到 `skills/wqq-wechat-article/scripts/arg-parser.ts`
- [x] 2.3 复制 `wqq-wechat-skills/skills/shared/wqq-skills-env.ts` 到 `skills/wqq-wechat-article/scripts/wqq-skills-env.ts`
- [x] 2.4 复制对应的测试文件（retry.test.ts、arg-parser.test.ts）
- [x] 2.5 更新所有 `.ts` 文件中的 import 路径：将 `../../shared/xxx` 改为 `./xxx`

## 3. Skill 注册

- [x] 3.1 创建 `.claude/skills/wqq-wechat-article/` 目录及 skill 注册文件（从原仓库 `.claude/` 配置适配）

## 4. 项目文档更新

- [x] 4.1 更新 `CLAUDE.md`：在"直接执行"部分增加 wqq-wechat-article 的运行命令示例
- [x] 4.2 更新 `CLAUDE.md`：在"项目结构"部分增加 wqq-wechat-article 目录说明

## 5. 验证

- [x] 5.1 运行 `bun run typecheck` 确保类型检查通过
- [x] 5.2 运行 `bun run test` 确保所有测试通过（含新迁入的测试）
- [x] 5.3 运行 `npx -y bun skills/wqq-wechat-article/scripts/main.ts --help` 确认 CLI 可执行

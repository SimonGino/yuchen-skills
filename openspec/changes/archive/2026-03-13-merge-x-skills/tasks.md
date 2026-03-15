## 1. 创建新 skill 目录结构

- [x] 1.1 创建 `skills/x-toolkit/` 目录及子目录 `scripts/common/`、`scripts/bookmarks/`、`scripts/export/`
- [x] 1.2 创建 `skills/x-toolkit/SKILL.md`，合并两个原 skill 的触发条件和描述
- [x] 1.3 创建 `skills/x-toolkit/references/` 目录（如有需要迁移的参考文件）

## 2. 迁移共享模块到 common/

- [x] 2.1 将完全相同的共享模块（cookies、cookie-store、chrome-login、constants、fxtwitter、markdown、media-localizer、output、paths、thread、thread-markdown、tweet-article、tweet-to-markdown、tweet-utils、url-utils、wqq-skills-env、x-types、openai-format、arg-parser）复制到 `scripts/common/`
- [x] 2.2 合并 `http.ts`：统一保留 `retryAfterMs` 字段，放入 `scripts/common/`
- [x] 2.3 合并 `graphql.ts`：提取 `RetryConfig` 参数，重试配置改为调用方传入，放入 `scripts/common/`
- [x] 2.4 迁移所有共享模块的测试文件到 `scripts/common/`，去除重复

## 3. 迁移独有模块

- [x] 3.1 将书签独有模块（bookmarks-api、bookmarks-parser、state、debug、summary、tweet-detail）及测试迁移到 `scripts/bookmarks/`
- [x] 3.2 将推文导出独有模块（summarize）及测试迁移到 `scripts/export/`
- [x] 3.3 合并两个 `types.ts` 为统一的 `scripts/types.ts`，使用 `ExportMode` 联合类型

## 4. 修复模块导入路径

- [x] 4.1 更新 `scripts/bookmarks/` 下所有文件的 import 路径，指向 `../common/` 和 `../types`
- [x] 4.2 更新 `scripts/export/` 下所有文件的 import 路径，指向 `../common/` 和 `../types`
- [x] 4.3 更新 `scripts/common/` 内部模块之间的 import 路径（如有相对路径变化）

## 5. 创建统一入口

- [x] 5.1 创建 `scripts/main.ts` 统一入口，实现参数检测逻辑：有 `--urls` → 推文导出，无 → 交互选择
- [x] 5.2 从原 `x-bookmarks/scripts/main.ts` 提取书签导出流程为可调用函数
- [x] 5.3 从原 `x-to-md/scripts/main.ts` 提取推文导出流程为可调用函数
- [x] 5.4 实现 AskQuestion 交互选择（导出书签 / Debug 认证）

## 6. 验证测试

- [x] 6.1 运行全量测试，确保所有迁移后的测试通过
- [x] 6.2 手动验证推文导出模式（传入 URL）
- [x] 6.3 手动验证书签导出模式（无 URL，交互选择）

## 7. 清理与更新配置

- [x] 7.1 删除 `skills/x-bookmarks/` 目录
- [x] 7.2 删除 `skills/x-to-md/` 目录
- [x] 7.3 更新 `package.json` 中 test 脚本路径，指向 `skills/x-toolkit/scripts/`
- [x] 7.4 更新 `CLAUDE.md` 中关于共享代码同步维护的说明，移除「修改共享模块时必须同步更新两份」警告

## ADDED Requirements

### Requirement: 统一入口根据输入参数自动选择操作模式
系统 SHALL 提供单一入口 `main.ts`，根据是否传入 `--urls` 参数自动判断操作模式：有 URL 时进入推文导出模式，无 URL 时进入交互选择模式。

#### Scenario: 传入 URL 参数时直接进入推文导出模式
- **WHEN** 用户调用 `main.ts --urls "https://x.com/user/status/123"`
- **THEN** 系统直接进入推文导出流程，不弹出交互询问

#### Scenario: 传入多个 URL 参数时批量导出
- **WHEN** 用户调用 `main.ts --urls "url1" "url2" "url3"`
- **THEN** 系统对每个 URL 执行推文导出流程

#### Scenario: 无 URL 参数时进入交互选择
- **WHEN** 用户调用 `main.ts` 不传入 `--urls` 参数
- **THEN** 系统 SHALL 通过 AskQuestion 询问用户想要执行的操作

### Requirement: 交互选择支持书签导出和 Debug 认证
当用户未传入 URL 时，系统 SHALL 提供操作选项列表，至少包含「导出书签」和「Debug 认证」两个选项。

#### Scenario: 用户选择导出书签
- **WHEN** 用户在交互选择中选择「导出书签」
- **THEN** 系统进入书签导出流程，行为与原 x-bookmarks skill 一致

#### Scenario: 用户选择 Debug 认证
- **WHEN** 用户在交互选择中选择「Debug 认证」
- **THEN** 系统执行认证调试流程，行为与原 x-bookmarks 的 debug 功能一致

### Requirement: SKILL.md 触发条件覆盖两个原 skill 的所有触发词
新的 SKILL.md SHALL 包含原 `x-bookmarks` 和 `x-to-md` 的所有触发词和描述，确保用户在任何原有场景下都能触发新 skill。

#### Scenario: 用户提供推文 URL 时触发
- **WHEN** 用户提供 X/Twitter 的推文链接并要求导出为 Markdown
- **THEN** 新 skill 被触发

#### Scenario: 用户提到书签导出时触发
- **WHEN** 用户提到「导出 X 书签」「X bookmarks」等关键词
- **THEN** 新 skill 被触发

### Requirement: 保留两种模式的功能完整性
合并后的 skill SHALL 保留原 x-bookmarks 和 x-to-md 的所有功能，包括但不限于：书签分页、游标恢复、状态管理、聚合摘要（书签模式）；fxtwitter API、中文摘要、跳过已存在文件（推文导出模式）。

#### Scenario: 书签导出支持全量导出和增量导出
- **WHEN** 用户选择导出书签并传入 `--all` 参数
- **THEN** 系统使用游标恢复机制进行全量分页导出，跳过已导出的推文

#### Scenario: 推文导出自动生成中文摘要
- **WHEN** 用户导出推文且未禁用摘要
- **THEN** 系统使用 OpenAI API 生成中文摘要并嵌入 Markdown frontmatter

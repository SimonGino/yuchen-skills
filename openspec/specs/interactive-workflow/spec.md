## ADDED Requirements

### Requirement: 添加频道时交互确认

当用户请求添加频道但信息模糊时，Claude 必须（SHALL）先解析频道信息，然后通过 AskUserQuestion 展示解析结果，让用户确认后再执行添加操作。

#### Scenario: 用户提供频道 URL，确认后添加

- **WHEN** 用户提供一个 YouTube 频道 URL 请求添加
- **THEN** Claude 先展示解析到的频道名称和 handle，通过 AskUserQuestion 询问用户是否确认添加，确认后执行 `yt_rss_monitor.py add`

#### Scenario: 用户只提供频道名称，无 URL

- **WHEN** 用户只说了一个频道名但没有提供 URL
- **THEN** Claude 必须（SHALL）通过 AskUserQuestion 请求用户提供频道 URL 或 handle，然后再执行添加

#### Scenario: 用户明确提供了完整的频道名和 URL

- **WHEN** 用户同时提供了频道名和 URL，信息完整无歧义
- **THEN** Claude 可以直接执行添加，无需额外确认

### Requirement: 检查更新时的频道选择

当用户请求检查频道更新但未指定具体频道时，Claude 必须（SHALL）展示频道列表让用户选择。

#### Scenario: 用户未指定频道，列表中有多个频道

- **WHEN** 用户说「检查更新」「有什么新视频」且未指定频道名，且频道列表有 2 个以上频道
- **THEN** Claude 必须（SHALL）先执行 `yt_rss_monitor.py list` 获取频道列表，通过 AskUserQuestion 展示频道列表（含「全部频道」选项），让用户选择要检查的频道

#### Scenario: 用户已指定频道

- **WHEN** 用户说「检查老李的更新」明确指定了频道
- **THEN** Claude 直接使用 `--channel` 参数执行检查，跳过频道选择交互

#### Scenario: 频道列表只有一个频道

- **WHEN** 用户未指定频道，但频道列表只有 1 个频道
- **THEN** Claude 直接检查该频道，跳过选择交互

### Requirement: 总结视频前的视频选择

当检查到多个新视频时，Claude 必须（SHALL）展示视频列表让用户选择要总结的视频。

#### Scenario: 检查到多个新视频

- **WHEN** 检查结果包含 2 个或以上新视频
- **THEN** Claude 必须（SHALL）通过 AskUserQuestion 展示视频列表（标题 + 发布时间），提供「全部总结」和逐个视频的选项，让用户选择要总结的视频

#### Scenario: 只有一个新视频

- **WHEN** 检查结果只有 1 个新视频
- **THEN** Claude 直接处理该视频，跳过选择交互

#### Scenario: 没有新视频

- **WHEN** 检查结果为空
- **THEN** Claude 直接告知用户没有新视频，不触发交互

#### Scenario: 用户明确要求全部总结

- **WHEN** 用户说「全部总结」「都看看」等明确要求处理所有视频
- **THEN** Claude 跳过视频选择，直接处理全部视频

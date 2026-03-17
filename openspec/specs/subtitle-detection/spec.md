## Requirements

### Requirement: 下载前检测字幕可用性
系统 SHALL 在尝试下载字幕前，先用 yt-dlp `--list-subs` 检测视频的字幕可用性，根据结果决定后续路径。

#### Scenario: 视频有手动字幕
- **WHEN** `--list-subs` 检测到目标语言的手动字幕存在
- **THEN** 系统 SHALL 走手动字幕下载路径

#### Scenario: 视频仅有自动字幕
- **WHEN** `--list-subs` 检测到无手动字幕但有自动生成字幕
- **THEN** 系统 SHALL 走自动字幕下载路径

#### Scenario: 视频无任何字幕
- **WHEN** `--list-subs` 检测到既无手动字幕也无自动字幕
- **THEN** 系统 SHALL 打印日志"该视频无字幕，将使用音频转录"
- **AND** 直接跳到音频转录流程，不再尝试字幕下载

#### Scenario: 字幕检测本身失败
- **WHEN** `--list-subs` 调用因网络或认证原因失败
- **THEN** 系统 SHALL 将 stderr 打印到日志
- **AND** 回退到现有的逐步尝试逻辑（先手动、再自动、再转录）

## Requirements

### Requirement: 所有 yt-dlp 调用携带认证参数
系统 SHALL 在所有 `yt-dlp` subprocess 调用中附加 `--cookies-from-browser chrome` 和 `--remote-components ejs:github` 参数。

#### Scenario: 正常视频下载携带认证
- **WHEN** 系统调用 yt-dlp 执行任何操作（字幕下载、音频下载、视频信息获取、字幕检测）
- **THEN** 命令行 SHALL 包含 `--cookies-from-browser chrome --remote-components ejs:github`

#### Scenario: 认证参数通过公共常量管理
- **WHEN** 开发者需要修改认证参数
- **THEN** 只需修改 `YT_DLP_AUTH_ARGS` 常量一处，所有调用点自动生效

### Requirement: yt-dlp 失败时暴露 stderr
系统 SHALL 在 yt-dlp 返回非零退出码时，将 stderr 输出的前 500 字符打印到 `sys.stderr`。

#### Scenario: yt-dlp 下载音频失败
- **WHEN** `_download_audio` 中 yt-dlp 返回非零退出码
- **THEN** 系统 SHALL 将 `result.stderr[:500]` 打印到 sys.stderr
- **AND** 返回 None 表示失败

#### Scenario: yt-dlp 下载字幕失败
- **WHEN** `_try_download_sub` 中 yt-dlp 返回非零退出码
- **THEN** 系统 SHALL 将 `result.stderr[:500]` 打印到 sys.stderr

#### Scenario: yt-dlp 获取视频信息失败
- **WHEN** `get_video_info` 中 yt-dlp 返回非零退出码
- **THEN** 系统 SHALL 将 `result.stderr[:500]` 打印到 sys.stderr
- **AND** 返回空字典

### Requirement: 前置环境检查包含 deno
`ensure_yt_dlp()` SHALL 同时检查 `deno` 是否可用，不可用时打印安装提示。

#### Scenario: deno 已安装
- **WHEN** `deno --version` 返回零退出码
- **THEN** 检查通过，继续执行

#### Scenario: deno 未安装
- **WHEN** `deno --version` 失败或命令不存在
- **THEN** 系统 SHALL 打印错误提示"请先安装 deno: curl -fsSL https://deno.land/install.sh | sh"
- **AND** 返回 False

### Requirement: SKILL.md 前置条件更新
SKILL.md 的前置条件章节 SHALL 包含 Chrome 浏览器登录 YouTube 和 deno 运行时的要求。

#### Scenario: 用户阅读前置条件
- **WHEN** 用户查看 SKILL.md 的前置条件
- **THEN** SHALL 看到以下条目：Chrome 浏览器已登录 YouTube、deno 运行时已安装

## MODIFIED Requirements

### Requirement: Automatic audio transcription fallback when no subtitles available
When `download_subtitle()` fails to find both manual and auto-generated subtitles, the system SHALL automatically download the video's audio and transcribe it using local mlx-whisper, producing a text file in the same format as subtitle-derived text.

#### Scenario: Video with no subtitles gets transcribed via mlx-whisper
- **WHEN** a video has no manual subtitles AND no auto-generated subtitles
- **THEN** the system SHALL ensure mlx-whisper is installed (auto-install if missing), download the audio as mp3, transcribe using mlx-whisper CLI, and save the result to `{video_id}.txt` with the same metadata header format (title, channel, URL, duration)
- **AND** the return dict SHALL have `subtitle_type: "mlx-whisper"` and `success: True`

#### Scenario: mlx-whisper not installed — auto-install
- **WHEN** a video has no subtitles AND mlx-whisper is not installed
- **THEN** the system SHALL automatically execute `uv sync --project $HOME/.claude/skills/yt-monitor --extra transcribe` to install mlx-whisper
- **AND** print progress message indicating installation is in progress
- **AND** after installation succeeds, proceed with transcription

#### Scenario: mlx-whisper auto-install fails
- **WHEN** auto-install of mlx-whisper fails (network error, incompatible platform, etc.)
- **THEN** the system SHALL return `success: False` with `error` describing the failure
- **AND** the error message SHALL include the stderr output from the install command

#### Scenario: Video with subtitles does not trigger transcription
- **WHEN** a video has manual or auto-generated subtitles available
- **THEN** the system SHALL use the subtitle as before and NOT download audio or attempt transcription

### Requirement: Local mlx-whisper transcription via CLI
系统 SHALL 使用 mlx-whisper CLI 模式进行音频转录，而非 Python import 方式。

#### Scenario: mlx-whisper CLI 调用
- **WHEN** 需要转录音频文件
- **THEN** 系统 SHALL 执行 `uv run --project $HOME/.claude/skills/yt-monitor mlx_whisper "{audio_path}" --model mlx-community/whisper-large-v3-turbo --language zh --output-format srt`
- **AND** 解析输出的 srt 内容，提取纯文本

#### Scenario: 首次使用模型下载
- **WHEN** mlx-whisper 首次使用且模型未缓存
- **THEN** 系统 SHALL 打印提示"首次使用需下载 ~1.5GB 模型"

#### Scenario: 转录超时
- **WHEN** mlx-whisper 转录超过 600 秒
- **THEN** 系统 SHALL 终止进程并返回 `success: False`

### Requirement: mlx-whisper 自动检测与安装
系统 SHALL 在需要音频转录时自动检测 mlx-whisper 是否已安装，未安装则自动安装。

#### Scenario: mlx-whisper 已安装
- **WHEN** `uv run --project $HOME/.claude/skills/yt-monitor python -c "import mlx_whisper"` 成功
- **THEN** 直接进入转录流程

#### Scenario: mlx-whisper 未安装 — 自动安装成功
- **WHEN** import 检查失败
- **THEN** 系统 SHALL 执行 `uv sync --project $HOME/.claude/skills/yt-monitor --extra transcribe`
- **AND** 安装成功后重新检查确认可用
- **AND** 进入转录流程

#### Scenario: mlx-whisper 未安装 — 自动安装失败
- **WHEN** import 检查失败 AND `uv sync` 安装也失败
- **THEN** 系统 SHALL 返回 `success: False` 并在 error 中包含安装失败的 stderr

### Requirement: mlx-whisper 项目路径
系统 SHALL 使用 `$HOME/.claude/skills/yt-monitor` 作为 mlx-whisper 的 uv 项目路径。

#### Scenario: 路径解析
- **WHEN** 系统构造 `uv run --project` 命令
- **THEN** 项目路径 SHALL 为 `Path.home() / ".claude" / "skills" / "yt-monitor"`
- **AND** 不再使用 `SKILL_DIR`（代码仓库路径）

### Requirement: Audio download via yt-dlp
The system SHALL download audio using yt-dlp with mp3 format and authentication arguments.

#### Scenario: Audio download succeeds
- **WHEN** audio download is requested for a video
- **THEN** the system SHALL run `yt-dlp -x --audio-format mp3 --cookies-from-browser chrome --remote-components ejs:github` to extract audio
- **AND** save it to a temporary location under the subtitles directory

#### Scenario: Audio download fails
- **WHEN** yt-dlp fails to download audio
- **THEN** the system SHALL print `result.stderr[:500]` to sys.stderr
- **AND** return `success: False` with `error` describing the failure

### Requirement: MP3 download deduplication
The system SHALL check for existing MP3 files before downloading to avoid redundant downloads.

#### Scenario: MP3 file already exists
- **WHEN** audio download is requested for a video AND `{video_id}_audio.mp3` already exists in the output directory
- **THEN** the system SHALL skip the download and reuse the existing file
- **AND** the system SHALL log that it is reusing the existing file

#### Scenario: MP3 file does not exist
- **WHEN** audio download is requested for a video AND no existing MP3 file is found
- **THEN** the system SHALL download the audio using yt-dlp with authentication arguments

### Requirement: Temporary audio file cleanup
The system SHALL delete temporary audio files (mp3) after transcription is complete, regardless of success or failure.

#### Scenario: Successful transcription cleanup
- **WHEN** transcription completes successfully
- **THEN** all temporary mp3 files SHALL be deleted
- **AND** only the final `.txt` file remains

#### Scenario: Failed transcription cleanup
- **WHEN** transcription fails at any stage
- **THEN** all temporary mp3 files SHALL still be deleted

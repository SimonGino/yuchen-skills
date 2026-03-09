## ADDED Requirements

### Requirement: Automatic audio transcription fallback when no subtitles available
When `download_subtitle()` fails to find both manual and auto-generated subtitles, the system SHALL automatically download the video's audio and transcribe it, producing a text file in the same format as subtitle-derived text. The transcription strategy SHALL be: Gemini API (preferred) → local mlx-whisper (fallback).

#### Scenario: Video with no subtitles gets transcribed via Gemini API
- **WHEN** a video has no manual subtitles AND no auto-generated subtitles AND `GEMINI_API_KEY` is configured
- **THEN** the system SHALL download the audio as mp3, upload to Gemini API, request transcription, and save the result to `{video_id}.txt` with the same metadata header format (title, channel, URL, duration)
- **AND** the return dict SHALL have `subtitle_type: "gemini"` and `success: True`

#### Scenario: Gemini API fails, falls back to local mlx-whisper
- **WHEN** Gemini API transcription fails (network error, quota exceeded, etc.) or `GEMINI_API_KEY` is not configured
- **AND** mlx-whisper is installed locally
- **THEN** the system SHALL transcribe the audio using local mlx-whisper
- **AND** the return dict SHALL have `subtitle_type: "mlx-whisper"` and `success: True`

#### Scenario: All transcription methods fail
- **WHEN** both Gemini API and local mlx-whisper fail or are unavailable
- **THEN** the system SHALL return `success: False` with `error` describing the failure and available remediation (install mlx-whisper or configure GEMINI_API_KEY)

#### Scenario: Video with subtitles does not trigger transcription
- **WHEN** a video has manual or auto-generated subtitles available
- **THEN** the system SHALL use the subtitle as before and NOT download audio or attempt transcription

### Requirement: Gemini API audio transcription
The system SHALL use Gemini API for audio transcription as the preferred method, via REST API calls (no SDK dependency).

#### Scenario: Small audio file inline upload (≤ 20MB)
- **WHEN** the downloaded mp3 file is ≤ 20MB
- **THEN** the system SHALL encode the audio as base64 and pass it inline to `generateContent` endpoint with a transcription prompt

#### Scenario: Large audio file via Files API (> 20MB)
- **WHEN** the downloaded mp3 file exceeds 20MB
- **THEN** the system SHALL upload the file via Gemini Files API (`/upload/v1beta/files`)
- **AND** reference the uploaded file URI in the `generateContent` request

#### Scenario: Gemini API transcription prompt
- **WHEN** calling Gemini API for transcription
- **THEN** the system SHALL use a prompt requesting plain text transcription (e.g., "请将这段音频转录为纯文本，保留原始语言，不要添加时间戳或格式标记。")

### Requirement: Local mlx-whisper transcription
The system SHALL support local transcription via mlx-whisper as a fallback when Gemini API is unavailable.

#### Scenario: mlx-whisper installed and functional
- **WHEN** mlx-whisper is installed (`python3 -c "import mlx_whisper"` succeeds)
- **THEN** the system SHALL use mlx-whisper with `large-v3-turbo` model to transcribe the audio file
- **AND** save the transcription text to `{video_id}.txt`

#### Scenario: mlx-whisper not installed
- **WHEN** mlx-whisper import fails
- **THEN** the system SHALL skip this fallback and report it in the error message
- **AND** suggest `pip install mlx-whisper` in the error output

#### Scenario: First-time model download
- **WHEN** mlx-whisper is used for the first time and the model is not cached
- **THEN** the system SHALL print a progress message indicating model download (~1.5GB)

### Requirement: Audio download via yt-dlp
The system SHALL download audio using yt-dlp with mp3 format.

#### Scenario: Audio download succeeds
- **WHEN** audio download is requested for a video
- **THEN** the system SHALL run `yt-dlp -x --audio-format mp3` to extract audio
- **AND** save it to a temporary location under the subtitles directory

#### Scenario: Audio download fails
- **WHEN** yt-dlp fails to download audio (geo-restricted, deleted, etc.)
- **THEN** the system SHALL return `success: False` with `error` describing the failure

### Requirement: Temporary audio file cleanup
The system SHALL delete temporary audio files (mp3) after transcription is complete, regardless of success or failure.

#### Scenario: Successful transcription cleanup
- **WHEN** transcription completes successfully
- **THEN** all temporary mp3 files SHALL be deleted
- **AND** only the final `.txt` file remains

#### Scenario: Failed transcription cleanup
- **WHEN** transcription fails at any stage
- **THEN** all temporary mp3 files SHALL still be deleted

### Requirement: API key configuration
The system SHALL read `GEMINI_API_KEY` from `~/.wqq-skills/.env` for Gemini API calls.

#### Scenario: GEMINI_API_KEY available
- **WHEN** `GEMINI_API_KEY` is set in `~/.wqq-skills/.env`
- **THEN** the system SHALL use it for Gemini API authentication

#### Scenario: GEMINI_API_KEY missing, mlx-whisper available
- **WHEN** `GEMINI_API_KEY` is not found AND mlx-whisper is installed
- **THEN** the system SHALL skip Gemini API and use mlx-whisper directly

#### Scenario: Both unavailable
- **WHEN** `GEMINI_API_KEY` is not found AND mlx-whisper is not installed
- **THEN** the system SHALL return `success: False` with error "音频转录不可用：请配置 GEMINI_API_KEY 或安装 mlx-whisper (pip install mlx-whisper)"

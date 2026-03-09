## Requirements

### Requirement: Automatic audio transcription fallback when no subtitles available
When `download_subtitle()` fails to find both manual and auto-generated subtitles, the system SHALL automatically download the video's audio and transcribe it using local mlx-whisper, producing a text file in the same format as subtitle-derived text.

#### Scenario: Video with no subtitles gets transcribed via mlx-whisper
- **WHEN** a video has no manual subtitles AND no auto-generated subtitles AND mlx-whisper is installed
- **THEN** the system SHALL download the audio as mp3, transcribe using mlx-whisper, and save the result to `{video_id}.txt` with the same metadata header format (title, channel, URL, duration)
- **AND** the return dict SHALL have `subtitle_type: "mlx-whisper"` and `success: True`

#### Scenario: mlx-whisper not installed
- **WHEN** a video has no subtitles AND mlx-whisper is not installed
- **THEN** the system SHALL return `success: False` with `error` describing the failure
- **AND** the error message SHALL suggest `uv sync --project skills/yt-monitor --extra transcribe` as remediation
- **AND** the error message SHALL NOT mention Gemini API

#### Scenario: Video with subtitles does not trigger transcription
- **WHEN** a video has manual or auto-generated subtitles available
- **THEN** the system SHALL use the subtitle as before and NOT download audio or attempt transcription

### Requirement: Local mlx-whisper transcription
The system SHALL use local mlx-whisper as the sole transcription method for videos without subtitles.

#### Scenario: mlx-whisper installed and functional
- **WHEN** mlx-whisper is installed（`uv run --project skills/yt-monitor python -c "import mlx_whisper"` succeeds）
- **THEN** the system SHALL use mlx-whisper with `large-v3-turbo` model to transcribe the audio file
- **AND** save the transcription text to `{video_id}.txt`

#### Scenario: mlx-whisper not installed
- **WHEN** mlx-whisper import fails
- **THEN** the system SHALL return `success: False` with error suggesting `uv sync --project skills/yt-monitor --extra transcribe`

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

### Requirement: MP3 download deduplication
The system SHALL check for existing MP3 files before downloading to avoid redundant downloads.

#### Scenario: MP3 file already exists
- **WHEN** audio download is requested for a video AND `{video_id}_audio.mp3` already exists in the output directory
- **THEN** the system SHALL skip the download and reuse the existing file
- **AND** the system SHALL log that it is reusing the existing file

#### Scenario: MP3 file does not exist
- **WHEN** audio download is requested for a video AND no existing MP3 file is found
- **THEN** the system SHALL download the audio using `yt-dlp -x --audio-format mp3` as before

### Requirement: Temporary audio file cleanup
The system SHALL delete temporary audio files (mp3) after transcription is complete, regardless of success or failure.

#### Scenario: Successful transcription cleanup
- **WHEN** transcription completes successfully
- **THEN** all temporary mp3 files SHALL be deleted
- **AND** only the final `.txt` file remains

#### Scenario: Failed transcription cleanup
- **WHEN** transcription fails at any stage
- **THEN** all temporary mp3 files SHALL still be deleted

## MODIFIED Requirements

### Requirement: Automatic audio transcription fallback when no subtitles available
When `download_subtitle()` fails to find both manual and auto-generated subtitles, the system SHALL automatically download the video's audio and transcribe it using local mlx-whisper, producing a text file in the same format as subtitle-derived text.

#### Scenario: Video with no subtitles gets transcribed via mlx-whisper
- **WHEN** a video has no manual subtitles AND no auto-generated subtitles AND mlx-whisper is installed
- **THEN** the system SHALL download the audio as mp3, transcribe using mlx-whisper, and save the result to `{video_id}.txt` with the same metadata header format (title, channel, URL, duration)
- **AND** the return dict SHALL have `subtitle_type: "mlx-whisper"` and `success: True`

#### Scenario: mlx-whisper not installed
- **WHEN** a video has no subtitles AND mlx-whisper is not installed
- **THEN** the system SHALL return `success: False` with `error` describing the failure
- **AND** the error message SHALL suggest `pip install mlx-whisper` as remediation
- **AND** the error message SHALL NOT mention Gemini API

#### Scenario: Video with subtitles does not trigger transcription
- **WHEN** a video has manual or auto-generated subtitles available
- **THEN** the system SHALL use the subtitle as before and NOT download audio or attempt transcription

## REMOVED Requirements

### Requirement: Gemini API audio transcription
**Reason**: Simplifying to single local transcription path. Gemini API adds external dependency and API key management complexity without sufficient benefit.
**Migration**: mlx-whisper is now the sole transcription method. Install with `pip install mlx-whisper`.

### Requirement: API key configuration
**Reason**: `GEMINI_API_KEY` and `GEMINI_BASE_URL` are no longer needed since Gemini transcription is removed.
**Migration**: These environment variables can be safely removed from `~/.wqq-skills/.env`.

## ADDED Requirements

### Requirement: MP3 download deduplication
The system SHALL check for existing MP3 files before downloading to avoid redundant downloads.

#### Scenario: MP3 file already exists
- **WHEN** audio download is requested for a video AND `{video_id}_audio.mp3` already exists in the output directory
- **THEN** the system SHALL skip the download and reuse the existing file
- **AND** the system SHALL log that it is reusing the existing file

#### Scenario: MP3 file does not exist
- **WHEN** audio download is requested for a video AND no existing MP3 file is found
- **THEN** the system SHALL download the audio using `yt-dlp -x --audio-format mp3` as before

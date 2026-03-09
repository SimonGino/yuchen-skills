## MODIFIED Requirements

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

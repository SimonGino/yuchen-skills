## ADDED Requirements

### Requirement: Automatic text length detection after subtitle/transcription download
After generating the final `.txt` file, the system SHALL check the text length and report it in the return dict.

#### Scenario: Text length reported in return value
- **WHEN** a subtitle or transcription text file is successfully created
- **THEN** the return dict SHALL include `text_length: <character_count>` (excluding metadata header)
- **AND** SHALL include `chunked: True/False` indicating whether the text was split

### Requirement: Automatic chunking for long text
When the text content (excluding metadata header) exceeds 15000 characters, the system SHALL split it into multiple chunk files.

#### Scenario: Short text not chunked
- **WHEN** text content ≤ 15000 characters
- **THEN** the system SHALL save a single `{video_id}.txt` file as before
- **AND** return `chunked: False` and `chunk_files: ["{video_id}.txt"]`

#### Scenario: Long text automatically chunked
- **WHEN** text content > 15000 characters
- **THEN** the system SHALL split the text into chunks of ≤ 15000 characters each
- **AND** save each chunk as `{video_id}_part{N}.txt` (N starting from 1)
- **AND** also keep the full `{video_id}.txt` for reference
- **AND** return `chunked: True` and `chunk_files: ["{video_id}_part1.txt", "{video_id}_part2.txt", ...]`

#### Scenario: Chunk boundaries at paragraph breaks
- **WHEN** text is being split into chunks
- **THEN** each chunk boundary SHALL be at a paragraph break (double newline `\n\n`)
- **AND** chunks SHALL NOT split in the middle of a paragraph

### Requirement: Chunk metadata headers
Each chunk file SHALL include metadata identifying it as part of a larger text.

#### Scenario: Chunk file header format
- **WHEN** a chunk file `{video_id}_part{N}.txt` is created
- **THEN** it SHALL include the same metadata header as the full file (title, channel, URL, duration)
- **AND** SHALL add a line `分块: {N}/{total}` in the header

### Requirement: Chunk overlap for context continuity
Each chunk (except the first) SHALL include a small overlap with the previous chunk to preserve context.

#### Scenario: Overlap between consecutive chunks
- **WHEN** text is split into chunks at a paragraph boundary
- **THEN** each chunk (except the first) SHALL include the last paragraph of the previous chunk as context prefix, marked with `[上文重叠]` and `[/上文重叠]`
- **AND** the overlap text SHALL NOT count toward the chunk's 15000-character limit

### Requirement: SKILL.md updated with chunked text handling guidance
The SKILL.md SHALL include guidance for Claude on how to handle chunked subtitle text.

#### Scenario: Claude encounters chunked text
- **WHEN** `download_subtitle()` returns `chunked: True`
- **THEN** SKILL.md guidance SHALL instruct Claude to:
  1. Read each chunk file in order
  2. Generate a summary for each chunk
  3. Synthesize chunk summaries into a final unified summary
  4. Pay attention to overlap sections to maintain continuity

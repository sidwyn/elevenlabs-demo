# pts-audio-gen

Converts [Path to Staff](https://pathtostaff.com) newsletter posts into audio using the [ElevenLabs](https://elevenlabs.io) TTS API. Built as an experiment to see if newsletter articles could work as a podcast format.

## Setup

```bash
npm install
export ELEVENLABS_API_KEY=your_key_here
```

## Usage

```bash
# Basic - converts a markdown post to mp3
node index.js posts/my-article.md

# Specify output path
node index.js posts/my-article.md -o output/episode-1.mp3

# Use a different voice
node index.js posts/my-article.md -v 29vD33N1tVWKVnPb2Krt

# Use multilingual model (for mixed-language content)
node index.js posts/my-article.md -m multilingual

# More expressive delivery (lower stability)
node index.js posts/my-article.md -s 0.3

# List available voices
node index.js --list-voices
```

## How it works

1. Reads a markdown file and strips it to clean plain text (removing code blocks, images, links, frontmatter)
2. If the text is under 5000 chars, sends it as a single request
3. If longer, splits on paragraph boundaries into chunks and synthesizes each separately
4. Concatenates the audio chunks into one mp3

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output` | Output file path | Same as input with .mp3 extension |
| `-v, --voice` | ElevenLabs voice ID | Rachel (21m00Tcm4TlvDq8ikWAM) |
| `-m, --model` | Model: standard, turbo, multilingual | turbo |
| `-s, --stability` | Voice stability 0-1 (lower = more expressive) | 0.5 |
| `-c, --clarity` | Clarity + similarity enhancement 0-1 | 0.75 |
| `--list-voices` | List available voices and exit | |

## Notes

- Long posts get chunked at paragraph boundaries to stay under the API's per-request limit
- MP3 concatenation is naive (just appending frames) which works fine for listening but isn't technically clean. Could use ffmpeg for proper muxing if needed.
- Rachel voice works well for newsletter content but worth experimenting with others via `--list-voices`

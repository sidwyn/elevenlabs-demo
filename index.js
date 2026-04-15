#!/usr/bin/env node

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { program } = require("commander");
const { Marked } = require("marked");

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Default voice - George (clear, warm, newsletter-friendly)
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

const MODELS = {
  standard: "eleven_monolingual_v1",
  turbo: "eleven_turbo_v2",
  multilingual: "eleven_multilingual_v2",
};

program
  .name("pts-audio")
  .description("Convert Path to Staff posts to audio via ElevenLabs")
  .argument("<file>", "Markdown file to convert")
  .option("-o, --output <path>", "Output audio file path")
  .option("-v, --voice <id>", "ElevenLabs voice ID", DEFAULT_VOICE_ID)
  .option(
    "-m, --model <name>",
    "Model: standard, turbo, or multilingual",
    "turbo"
  )
  .option(
    "-s, --stability <n>",
    "Voice stability 0-1 (lower = more expressive)",
    "0.5"
  )
  .option(
    "-c, --clarity <n>",
    "Clarity + similarity enhancement 0-1",
    "0.75"
  )
  .option("--list-voices", "List available voices and exit")
  .action(async (file, opts) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error(
        "Error: Set ELEVENLABS_API_KEY environment variable first."
      );
      console.error("  export ELEVENLABS_API_KEY=your_key_here");
      process.exit(1);
    }

    if (opts.listVoices) {
      await listVoices(apiKey);
      return;
    }

    // Read and strip markdown
    const mdPath = path.resolve(file);
    if (!fs.existsSync(mdPath)) {
      console.error(`File not found: ${mdPath}`);
      process.exit(1);
    }

    const markdown = fs.readFileSync(mdPath, "utf-8");
    const plainText = stripMarkdown(markdown);

    // Figure out output path
    const outputPath =
      opts.output || mdPath.replace(/\.md$/, ".mp3");

    console.log(`Input:    ${mdPath}`);
    console.log(`Output:   ${outputPath}`);
    console.log(`Voice:    ${opts.voice}`);
    console.log(`Model:    ${MODELS[opts.model] || opts.model}`);
    console.log(`Text:     ${plainText.length} chars`);
    console.log();

    // ElevenLabs has a per-request char limit
    if (plainText.length > 5000) {
      console.log("Text exceeds 5000 chars, splitting into chunks...");
      await synthesizeChunked(plainText, outputPath, opts, apiKey);
    } else {
      await synthesize(plainText, outputPath, opts, apiKey);
    }
  });

/**
 * Strip markdown to readable plain text suitable for TTS.
 * Removes headers, links, images, code blocks, etc but keeps
 * the text readable and flowing.
 */
function stripMarkdown(md) {
  let text = md;

  // Remove frontmatter
  text = text.replace(/^---[\s\S]*?---\n*/m, "");

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`[^`]+`/g, "");

  // Remove images
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");

  // Convert links to just text
  text = text.replace(/\[([^\]]+)\]\(.*?\)/g, "$1");

  // Remove headers but keep the text
  text = text.replace(/^#{1,6}\s+/gm, "");

  // Remove bold/italic markers
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, "");

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, "");

  // Convert list items to sentences
  text = text.replace(/^[\s]*[-*+]\s+/gm, "");
  text = text.replace(/^[\s]*\d+\.\s+/gm, "");

  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Synthesize text to audio using ElevenLabs API
 */
async function synthesize(text, outputPath, opts, apiKey) {
  const modelId = MODELS[opts.model] || opts.model;

  console.log("Sending to ElevenLabs...");

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${opts.voice}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: parseFloat(opts.stability),
          similarity_boost: parseFloat(opts.clarity),
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error(`API error (${response.status}): ${err}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`Done! Saved to ${outputPath} (${formatBytes(buffer.length)})`);
}

/**
 * Split long text into chunks and synthesize each, then concat.
 * Splits on paragraph boundaries to keep natural pauses.
 */
async function synthesizeChunked(text, outputPath, opts, apiKey) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > 4500 && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  console.log(`Split into ${chunks.length} chunks\n`);

  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`
    );

    const modelId = MODELS[opts.model] || opts.model;
    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${opts.voice}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: chunks[i],
          model_id: modelId,
          voice_settings: {
            stability: parseFloat(opts.stability),
            similarity_boost: parseFloat(opts.clarity),
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(`API error on chunk ${i + 1}: ${err}`);
      process.exit(1);
    }

    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  // Naive concat - works for mp3 since frames are independent
  const combined = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, combined);
  console.log(
    `\nDone! Saved to ${outputPath} (${formatBytes(combined.length)})`
  );
}

/**
 * List available voices from ElevenLabs
 */
async function listVoices(apiKey) {
  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    console.error(`Failed to fetch voices: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log("Available voices:\n");
  for (const voice of data.voices) {
    const labels = voice.labels
      ? Object.values(voice.labels).join(", ")
      : "";
    console.log(`  ${voice.voice_id}  ${voice.name} (${labels})`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

program.parse();

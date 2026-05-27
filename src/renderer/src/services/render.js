// Render pipeline — turns annotated script lines into audio.
//
// For each line, call the configured TTS provider with the assigned voice,
// collect the audio Blob, and stitch the chapter together using Web Audio.
// No ffmpeg required for MVP; we encode the concatenated buffer to WAV.

import { synthesize } from "./tts.js";

// AudioContext is created lazily so non-audio screens never instantiate it.
let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
  return _ctx;
}

// Render a single chapter.
// Returns { blobs[], buffer, wavBlob, url, duration, skipped[] }.
// Calls `onProgress({line, total, status})` after each line.
export async function renderChapter({
  provider,        // default TTS provider (used when voiceProvider isn't given)
  voiceProvider,   // optional (voiceId) => provider; lets each voice live on a different engine
  lines,           // [{speaker, kind, text}]
  voiceFor,        // (speakerId) => voiceId | null
  pauseBetween = 0.35,  // seconds of silence between paragraphs
  signal,
  onProgress,
}) {
  const total = lines.length;
  const blobs = [];
  const buffers = [];
  const skipped = [];

  for (let i = 0; i < lines.length; i++) {
    if (signal?.aborted) throw new Error("Render cancelled");
    const line = lines[i];
    onProgress?.({ line: i, total, status: "rendering", text: line.text });

    if (line.kind === "scene") {
      // Scene markers get a longer pause + no audio.
      buffers.push(silentBuffer(1.2));
      blobs.push(null);
      continue;
    }

    const voiceId = voiceFor(line.speaker);
    if (!voiceId) {
      onProgress?.({ line: i, total, status: "skipped", reason: "no voice" });
      skipped.push({ line: i, reason: "no voice" });
      buffers.push(silentBuffer(pauseBetween));
      blobs.push(null);
      continue;
    }

    const lineProvider = voiceProvider ? (voiceProvider(voiceId) || provider) : provider;

    try {
      const blob = await synthesize({
        provider: lineProvider,
        voice: voiceId,
        input: line.text,
        signal,
      });
      blobs.push(blob);
      const arrayBuf = await blob.arrayBuffer();
      const decoded = await ctx().decodeAudioData(arrayBuf.slice(0));
      buffers.push(decoded);
      buffers.push(silentBuffer(pauseBetween));
    } catch (err) {
      onProgress?.({ line: i, total, status: "error", error: err.message });
      skipped.push({ line: i, reason: err.message });
      buffers.push(silentBuffer(pauseBetween));
    }
  }

  // Stitch buffers into one AudioBuffer.
  const buffer = concatBuffers(buffers);
  const wavBlob = bufferToWav(buffer);
  const url = URL.createObjectURL(wavBlob);

  onProgress?.({ line: total, total, status: "done" });
  return { blobs, buffer, wavBlob, url, duration: buffer.duration, skipped };
}

// Quick-play a single line for preview.
export async function previewLine({ provider, voiceId, text, signal }) {
  const blob = await synthesize({ provider, voice: voiceId, input: text, signal });
  const url = URL.createObjectURL(blob);
  return { blob, url };
}

// ── helpers ────────────────────────────────────────────────────────────

function silentBuffer(seconds) {
  const sr = ctx().sampleRate;
  return ctx().createBuffer(1, Math.max(1, Math.floor(seconds * sr)), sr);
}

function concatBuffers(buffers) {
  if (buffers.length === 0) return silentBuffer(0.01);
  const sr = ctx().sampleRate;
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = ctx().createBuffer(channels, total, sr);
  let offset = 0;
  for (const b of buffers) {
    for (let ch = 0; ch < channels; ch++) {
      const src = b.getChannelData(Math.min(ch, b.numberOfChannels - 1));
      out.getChannelData(ch).set(src, offset);
    }
    offset += b.length;
  }
  return out;
}

// Encode an AudioBuffer as 16-bit PCM WAV. Returns a Blob.
function bufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const bufView = new ArrayBuffer(headerSize + dataSize);
  const v = new DataView(bufView);

  // RIFF header
  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);          // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);         // bits per sample
  writeStr(v, 36, "data");
  v.setUint32(40, dataSize, true);

  // Interleave + 16-bit PCM
  const ch = [];
  for (let c = 0; c < channels; c++) ch.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, ch[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([bufView], { type: "audio/wav" });
}

function writeStr(v, offset, s) {
  for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
}

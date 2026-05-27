// ============================================================
// m4b.js — bundle per-chapter WAVs into a single .m4b audiobook
// with chapter markers, cover art, and id3-style metadata.
//
// Uses ffmpeg.wasm (single-threaded build) so this runs entirely
// in the renderer without spawning a native ffmpeg binary. The
// lazy `getFfmpeg()` import keeps the ~10 MB wasm out of the
// initial bundle until the user actually exports.
//
// Inputs:
//   chapters: [{ num, title, wavBlob, duration }]  — duration in seconds
//   title:    audiobook title
//   author:   audiobook author
//   cover:    optional Blob (jpg / png) for embedded cover art
//
// Returns: Blob of type "audio/mp4".
// ============================================================

let ffmpegPromise = null;

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      // Dynamic import keeps ffmpeg.wasm out of the main bundle.
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      await ff.load();
      return ff;
    })();
  }
  return ffmpegPromise;
}

/**
 * Preload ffmpeg.wasm so the first export doesn't pay the load cost.
 * Safe to call multiple times; resolves to the same instance.
 */
export async function preloadFfmpeg() {
  return getFfmpeg();
}

export function isFfmpegLoaded() {
  return ffmpegPromise !== null;
}

/**
 * Build an FFMETADATA1 file with one [CHAPTER] block per chapter.
 * Timestamps are in milliseconds (TIMEBASE=1/1000).
 */
function buildMetadata({ title, author, chapters }) {
  const esc = (s) => String(s || "").replace(/([=;#\\])/g, "\\$1").replace(/\n/g, "\\n");
  const out = [";FFMETADATA1"];
  if (title)  out.push(`title=${esc(title)}`);
  if (author) out.push(`artist=${esc(author)}`, `album_artist=${esc(author)}`);
  if (title)  out.push(`album=${esc(title)}`);
  out.push(`genre=Audiobook`);

  let cursorMs = 0;
  for (const c of chapters) {
    const startMs = cursorMs;
    const endMs = startMs + Math.max(1, Math.round((c.duration || 0) * 1000));
    out.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${startMs}`, `END=${endMs}`, `title=${esc(`Ch. ${c.num} — ${c.title}`)}`);
    cursorMs = endMs;
  }
  return out.join("\n") + "\n";
}

export async function makeM4b({ chapters, title, author, cover, onProgress, onLog }) {
  if (!chapters?.length) throw new Error("No chapters to export.");

  const { fetchFile } = await import("@ffmpeg/util");
  const ff = await getFfmpeg();

  // Hook up status callbacks. ffmpeg.wasm emits progress as { progress: 0..1 }.
  const progressHandler = ({ progress }) => onProgress?.(progress);
  const logHandler = ({ message }) => onLog?.(message);
  ff.on?.("progress", progressHandler);
  ff.on?.("log", logHandler);

  try {
    // Write each WAV into the virtual filesystem.
    const wavNames = [];
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      const data = await fetchFile(c.wavBlob);
      const name = `ch${String(i).padStart(3, "0")}.wav`;
      await ff.writeFile(name, data);
      wavNames.push(name);
    }

    // ffmpeg concat demuxer file list.
    const concat = wavNames.map((n) => `file '${n}'`).join("\n") + "\n";
    await ff.writeFile("concat.txt", new TextEncoder().encode(concat));

    // Chapter metadata.
    const meta = buildMetadata({ title, author, chapters });
    await ff.writeFile("meta.txt", new TextEncoder().encode(meta));

    if (cover) {
      const data = await fetchFile(cover);
      await ff.writeFile("cover.jpg", data);
    }

    // Build args. We do the concat + transcode + metadata mux in one pass.
    const args = [
      "-y",
      "-f", "concat", "-safe", "0", "-i", "concat.txt",
      "-i", "meta.txt",
    ];
    if (cover) args.push("-i", "cover.jpg");
    args.push("-map_metadata", "1", "-map_chapters", "1");
    args.push("-map", "0:a");
    if (cover) {
      args.push("-map", "2:v");
      args.push("-disposition:v", "attached_pic");
      args.push("-c:v", "mjpeg");
    }
    args.push(
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      "-f", "mp4",
      "audiobook.m4b",
    );

    await ff.exec(args);

    const out = await ff.readFile("audiobook.m4b");
    return new Blob([out.buffer], { type: "audio/mp4" });
  } finally {
    ff.off?.("progress", progressHandler);
    ff.off?.("log", logHandler);
    // Clean up VFS so a second export doesn't trip over leftover files.
    try {
      for (const name of (await ff.listDir?.("/")) || []) {
        if (!name.isDir) await ff.deleteFile?.("/" + name.name);
      }
    } catch {}
  }
}

/** Format a duration in seconds as HH:MM:SS for previews. */
export function fmtDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

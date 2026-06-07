// ============================================================
// JustWrite — Tauri 2 backend commands.
//
// Mirrors the Electron IPC contract one-for-one so the renderer-side
// `window.justwrite.{project,images}` API stays unchanged:
//
//   project_save(snapshot, suggested_name)   — native save dialog
//   project_save_to(path, snapshot)          — silent write to known path
//   project_open()                           — native open dialog
//   project_autosave(project_id, snapshot)   — silent rotating autosave to AppData
//   project_autosave_dir()                   — absolute path of the autosave folder
//   project_autosave_list()                  — every autosave file as { projectId, title, savedAt, generation, path }
//   project_autosave_read(path)              — parsed snapshot at an absolute path
//
//   images_save(name, buffer)   — write bytes to AppData/images/, return record
//   images_read(path)           — read bytes, return data URL
//   images_delete(path)         — unlink
// ============================================================

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;

// ─── DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct SaveOk {
    ok: bool,
    path: String,
}

#[derive(Serialize, Deserialize)]
struct OpenOk {
    ok: bool,
    path: String,
    snapshot: Value,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageRecord {
    /// Absolute path on disk. The renderer stores this verbatim — it's
    /// opaque, only ever passed back into `images_read` / `images_delete`.
    path: String,
    /// Sanitized filename, displayed in the Images modal.
    name: String,
    /// ms since epoch when this image was added — matches the renderer's
    /// `Date.now()` shape so it sorts correctly without conversion.
    added_at: u128,
}

// ─── Project save / open ─────────────────────────────────────────────

#[tauri::command]
async fn project_save(
    app: AppHandle,
    snapshot: Value,
    suggested_name: Option<String>,
) -> Result<SaveOk, String> {
    let default = suggested_name
        .filter(|s| !s.is_empty())
        .map(|s| format!("{s}.jw.json"))
        .unwrap_or_else(|| "project.jw.json".to_string());

    // tauri-plugin-dialog v2 returns FilePath enum; blocking_* variants run
    // synchronously which is fine here because this command itself is async.
    let path = app
        .dialog()
        .file()
        .set_title("Save JustWrite project")
        .set_file_name(&default)
        .add_filter("JustWrite project", &["json"])
        .blocking_save_file();

    let Some(file_path) = path else {
        return Err("cancelled".into());
    };
    let path_buf: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    fs::write(&path_buf, json).map_err(|e| e.to_string())?;
    Ok(SaveOk { ok: true, path: path_buf.display().to_string() })
}

#[tauri::command]
async fn project_save_to(path: String, snapshot: Value) -> Result<SaveOk, String> {
    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(SaveOk { ok: true, path })
}

// Autosave lands here; rotation keeps two prior generations so a bad write
// or accidental wipe can be recovered from disk without a manual export.
fn autosave_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    p.push("projects");
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

fn safe_id(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() { "project".to_string() } else { cleaned }
}

#[tauri::command]
async fn project_autosave(
    app: AppHandle,
    project_id: String,
    snapshot: Value,
) -> Result<SaveOk, String> {
    let dir = autosave_dir(&app)?;
    let id = safe_id(&project_id);
    let current = dir.join(format!("{id}.autosave.json"));
    let prev    = dir.join(format!("{id}.autosave.prev.json"));
    let prev2   = dir.join(format!("{id}.autosave.prev2.json"));
    let tmp     = dir.join(format!("{id}.autosave.tmp.json"));

    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    // Write to tmp first, then rotate + rename so a crash mid-write can't
    // corrupt the live autosave file.
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if prev.exists()    { let _ = fs::remove_file(&prev2); let _ = fs::rename(&prev, &prev2); }
    if current.exists() { let _ = fs::rename(&current, &prev); }
    fs::rename(&tmp, &current).map_err(|e| e.to_string())?;

    Ok(SaveOk { ok: true, path: current.display().to_string() })
}

#[tauri::command]
async fn project_autosave_dir(app: AppHandle) -> Result<String, String> {
    let dir = autosave_dir(&app)?;
    Ok(dir.display().to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutosaveEntry {
    project_id: String,
    title: String,
    saved_at: String,
    generation: String,
    path: String,
}

#[tauri::command]
async fn project_autosave_list(app: AppHandle) -> Result<Vec<AutosaveEntry>, String> {
    let dir = autosave_dir(&app)?;
    let mut out: Vec<AutosaveEntry> = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(out),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        // Suffix order matters — `.autosave.prev2.json` also ends with
        // `.autosave.json` if we strip naively. Check longest first.
        let (project_id, generation) = if let Some(id) = name.strip_suffix(".autosave.prev2.json") {
            (id.to_string(), "prev2".to_string())
        } else if let Some(id) = name.strip_suffix(".autosave.prev.json") {
            (id.to_string(), "prev".to_string())
        } else if let Some(id) = name.strip_suffix(".autosave.json") {
            (id.to_string(), "current".to_string())
        } else {
            continue;
        };
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let parsed: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let title = parsed
            .get("project")
            .and_then(|p| p.get("title"))
            .and_then(|t| t.as_str())
            .unwrap_or("Untitled")
            .to_string();
        let saved_at = parsed
            .get("savedAt")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        out.push(AutosaveEntry {
            project_id,
            title,
            saved_at,
            generation,
            path: path.display().to_string(),
        });
    }
    // Most recent first; empty savedAt sorts last.
    out.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(out)
}

#[tauri::command]
async fn project_autosave_read(path: String) -> Result<Value, String> {
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let snapshot: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
async fn project_open(app: AppHandle) -> Result<OpenOk, String> {
    let path = app
        .dialog()
        .file()
        .set_title("Open JustWrite project")
        .add_filter("JustWrite project", &["json"])
        .blocking_pick_file();

    let Some(file_path) = path else {
        return Err("cancelled".into());
    };
    let path_buf: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
    let text = fs::read_to_string(&path_buf).map_err(|e| e.to_string())?;
    let snapshot: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(OpenOk { ok: true, path: path_buf.display().to_string(), snapshot })
}

// ─── Image storage ───────────────────────────────────────────────────

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    p.push("images");
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn safe_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() { "image".to_string() } else { cleaned }
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "heic" => "image/heic",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
async fn images_save(
    app: AppHandle,
    // Bytes ride in as the raw IPC body (zero-copy on the JS side, no
    // number[] JSON blowup). The original filename comes in as a
    // base64-encoded `x-image-name` header so non-ASCII names survive
    // the HTTP header transport.
    request: Request<'_>,
) -> Result<ImageRecord, String> {
    let InvokeBody::Raw(buffer) = request.body() else {
        return Err("images_save expects a raw binary body".into());
    };

    let name_header = request
        .headers()
        .get("x-image-name")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-image-name header")?;
    let name_bytes = base64::engine::general_purpose::STANDARD
        .decode(name_header)
        .map_err(|e| format!("x-image-name not valid base64: {e}"))?;
    let name = String::from_utf8(name_bytes)
        .map_err(|e| format!("x-image-name not valid utf-8: {e}"))?;

    let dir = images_dir(&app)?;
    let safe = safe_filename(&name);
    let ext = std::path::Path::new(&safe)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("bin")
        .to_string();

    let now = now_millis();
    let id = format!("img_{now}");
    let filename = format!("{id}.{ext}");
    let path = dir.join(&filename);
    fs::write(&path, buffer).map_err(|e| e.to_string())?;

    Ok(ImageRecord {
        path: path.display().to_string(),
        name: safe,
        added_at: now,
    })
}

#[tauri::command]
async fn images_read(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let mime = mime_for_ext(ext);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
async fn images_delete(path: String) -> Result<bool, String> {
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(true)
}

// ─── Folder picker ───────────────────────────────────────────────────
// Used by Settings → AI providers → Install Docker Desktop → Advanced
// options → custom install location. Mirrors the existing project_save /
// project_open pattern of routing every native dialog through a Rust
// command instead of the JS plugin so we keep a single capability surface.

#[tauri::command]
async fn pick_directory(
    app: AppHandle,
    title: Option<String>,
    default_path: Option<String>,
) -> Option<String> {
    let mut dlg = app
        .dialog()
        .file()
        .set_title(&title.unwrap_or_else(|| "Choose a folder".to_string()));
    if let Some(p) = default_path.as_deref().filter(|s| !s.is_empty()) {
        dlg = dlg.set_directory(p);
    }
    let picked = dlg.blocking_pick_folder()?;
    picked.into_path().ok().map(|p| p.display().to_string())
}

// ─── External opener ─────────────────────────────────────────────────
// `window.open` does nothing useful inside a Tauri webview — the OS
// default handler is the right surface for "Open on the web" / future
// "Reveal in folder" affordances. Validates http(s) to avoid handing
// arbitrary URI schemes to the OS.

#[tauri::command]
async fn open_external(target: String) -> Result<bool, String> {
    if !target.starts_with("http://") && !target.starts_with("https://") {
        return Err("open_external only handles http(s) URLs".into());
    }
    open::that(&target).map_err(|e| e.to_string())?;
    Ok(true)
}

// ─── Generic binary save (Save-As) ───────────────────────────────────
// WebView2 ignores `<a download>` on blob: URLs, so any "Save as WAV /
// PDF / EPUB / …" button in the renderer routes here. Bytes ride the
// raw IPC body (zero-copy, same pattern as `images_save`); the suggested
// filename and a single file-type filter come in as base64 headers.

#[tauri::command]
async fn shell_save_file(
    app: AppHandle,
    request: Request<'_>,
) -> Result<SaveOk, String> {
    let InvokeBody::Raw(buffer) = request.body() else {
        return Err("shell_save_file expects a raw binary body".into());
    };

    let headers = request.headers();
    let decode_b64_header = |key: &str| -> Option<String> {
        let raw = headers.get(key)?.to_str().ok()?;
        let bytes = base64::engine::general_purpose::STANDARD.decode(raw).ok()?;
        String::from_utf8(bytes).ok()
    };

    let suggested = decode_b64_header("x-save-name").unwrap_or_else(|| "download".to_string());
    let title = decode_b64_header("x-save-title").unwrap_or_else(|| "Save file".to_string());
    let filter_name = decode_b64_header("x-filter-name").unwrap_or_else(|| "File".to_string());
    let filter_ext = decode_b64_header("x-filter-ext").unwrap_or_default();

    let mut dialog = app
        .dialog()
        .file()
        .set_title(&title)
        .set_file_name(&suggested);
    if !filter_ext.is_empty() {
        let exts: Vec<&str> = filter_ext.split(',').filter(|s| !s.is_empty()).collect();
        if !exts.is_empty() {
            dialog = dialog.add_filter(&filter_name, &exts);
        }
    }

    let Some(file_path) = dialog.blocking_save_file() else {
        return Err("cancelled".into());
    };
    let path_buf: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
    fs::write(&path_buf, buffer).map_err(|e| e.to_string())?;
    Ok(SaveOk { ok: true, path: path_buf.display().to_string() })
}

// ─── Chapter audio storage ───────────────────────────────────────────
// Rendered chapter WAVs land in $APPDATA/<identifier>/audio/<projectId>/
// <chapterId>.wav so renders survive an app refresh / re-open. Playback
// uses the asset protocol (configured in tauri.conf.json), so the
// renderer's <audio> element streams the file directly instead of pulling
// the whole WAV through IPC.

fn audio_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let mut p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    p.push("audio");
    p.push(safe_id(project_id));
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioRecord {
    chapter_id: String,
    path: String,
    size: u64,
}

#[tauri::command]
async fn audio_save(app: AppHandle, request: Request<'_>) -> Result<AudioRecord, String> {
    let InvokeBody::Raw(buffer) = request.body() else {
        return Err("audio_save expects a raw binary body".into());
    };
    let headers = request.headers();
    let project_id = headers
        .get("x-project-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-project-id header")?
        .to_string();
    let chapter_id = headers
        .get("x-chapter-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-chapter-id header")?
        .to_string();

    let dir = audio_dir(&app, &project_id)?;
    let filename = format!("{}.wav", safe_id(&chapter_id));
    let path = dir.join(&filename);
    fs::write(&path, buffer).map_err(|e| e.to_string())?;
    let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

    Ok(AudioRecord {
        chapter_id,
        path: path.display().to_string(),
        size,
    })
}

#[tauri::command]
async fn audio_delete(path: String) -> Result<bool, String> {
    if std::path::Path::new(&path).exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
async fn audio_clear_project(app: AppHandle, project_id: String) -> Result<bool, String> {
    let dir = audio_dir(&app, &project_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
async fn audio_save_as(
    app: AppHandle,
    src_path: String,
    suggested_name: Option<String>,
) -> Result<SaveOk, String> {
    let default = suggested_name
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "audio.wav".to_string());
    let Some(file_path) = app
        .dialog()
        .file()
        .set_title("Save chapter audio")
        .set_file_name(&default)
        .add_filter("WAV audio", &["wav"])
        .blocking_save_file()
    else {
        return Err("cancelled".into());
    };
    let dest: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
    fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(SaveOk { ok: true, path: dest.display().to_string() })
}

// ─── Edge TTS (Microsoft Read Aloud) ─────────────────────────────────
// Renderer cannot reach Microsoft's WebSocket endpoint directly — it
// needs a `Sec-WebSocket-Version` header the WebView2 spec API forbids
// setting from JS. So we route through the `msedge-tts` Rust crate.
//
// The voice catalogue (~400 neural voices across ~140 locales) is
// fetched once via HTTP and cached for the process lifetime. Each
// synth call opens a fresh WebSocket — fine at per-line granularity,
// where each render is one round-trip of ~50ms+audio.

use msedge_tts::{
    tts::{client::connect as edge_connect, SpeechConfig},
    voice::{get_voices_list, Voice},
};
use std::sync::OnceLock;

static EDGE_VOICES_CACHE: OnceLock<Vec<Voice>> = OnceLock::new();

fn edge_voices_cached() -> Result<&'static Vec<Voice>, String> {
    if let Some(v) = EDGE_VOICES_CACHE.get() {
        return Ok(v);
    }
    let voices = get_voices_list().map_err(|e| format!("Edge TTS: voice list fetch failed: {e}"))?;
    // Two callers can race the first fetch and both call get_voices_list();
    // OnceLock::set returns the conflicting value if already set, so we just
    // drop the duplicate and return whatever landed first.
    let _ = EDGE_VOICES_CACHE.set(voices);
    Ok(EDGE_VOICES_CACHE.get().expect("set above"))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeTtsVoiceDto {
    /// Short name like "en-US-EmmaMultilingualNeural" — what the
    /// renderer stores as the voice id and what's passed back to
    /// `tts_edge_speech`.
    id: String,
    /// Friendly display label like "Microsoft Emma Online (Natural)".
    name: String,
    gender: String,
    locale: String,
}

#[tauri::command]
async fn tts_edge_voices() -> Result<Vec<EdgeTtsVoiceDto>, String> {
    tokio::task::spawn_blocking(|| {
        let voices = edge_voices_cached()?;
        let out: Vec<EdgeTtsVoiceDto> = voices
            .iter()
            .filter_map(|v| {
                let id = v.short_name.clone()?;
                Some(EdgeTtsVoiceDto {
                    name: v.friendly_name.clone().unwrap_or_else(|| id.clone()),
                    id,
                    gender: v.gender.clone().unwrap_or_default(),
                    locale: v.locale.clone().unwrap_or_default(),
                })
            })
            .collect();
        Ok::<_, String>(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn tts_edge_speech(voice: String, text: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        let voices = edge_voices_cached()?;
        let v = voices
            .iter()
            .find(|v| v.short_name.as_deref() == Some(voice.as_str()))
            .ok_or_else(|| format!("Edge TTS: unknown voice '{voice}'"))?;
        let cfg = SpeechConfig::from(v);
        let mut client = edge_connect().map_err(|e| format!("Edge TTS: connect failed: {e}"))?;
        let audio = client
            .synthesize(&text, &cfg)
            .map_err(|e| format!("Edge TTS: synthesize failed: {e}"))?;
        Ok::<_, String>(audio.audio_bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── GPU detection ───────────────────────────────────────────────────
// Returns best-effort GPU info. Never errors — unknown hardware yields the
// fallback struct so the renderer always has something to display.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuInfo {
    vendor: String,  // "nvidia" | "amd" | "apple" | "intel" | "unknown"
    name: String,
    vram_mb: u64,    // 0 when detection failed
}

impl GpuInfo {
    fn unknown() -> Self {
        GpuInfo { vendor: "unknown".into(), name: "Unknown GPU".into(), vram_mb: 0 }
    }
}

/// Run a subprocess with a 10-second wall-clock timeout.
/// Returns stdout on success, None if the command was not found, timed out, or
/// exited non-zero.
async fn run_cmd(program: &str, args: &[&str]) -> Option<String> {
    let child = tokio::process::Command::new(program)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        child.wait_with_output(),
    )
    .await
    .ok()?
    .ok()?;
    if output.status.success() {
        String::from_utf8(output.stdout).ok()
    } else {
        None
    }
}

/// Parse nvidia-smi CSV output: "<name>, <mib>" → (name, vram_mb).
fn parse_nvidia_smi(raw: &str) -> Option<(String, u64)> {
    let line = raw.lines().next()?.trim();
    let mut parts = line.splitn(2, ',');
    let name = parts.next()?.trim().to_string();
    let vram: u64 = parts.next()?.trim().parse().ok()?;
    Some((name, vram))
}

/// Guess vendor from an adapter name string (case-insensitive).
fn vendor_from_name(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.contains("amd") || lower.contains("radeon") { return "amd"; }
    if lower.contains("intel") { return "intel"; }
    if lower.contains("nvidia") || lower.contains("geforce") { return "nvidia"; }
    if lower.contains("apple") { return "apple"; }
    "unknown"
}

// ── Windows ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
async fn detect_gpu_impl() -> GpuInfo {
    // Try NVIDIA first — works on both Windows and Linux.
    if let Some(raw) = run_cmd(
        "nvidia-smi",
        &["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    )
    .await
    {
        if let Some((name, vram_mb)) = parse_nvidia_smi(&raw) {
            return GpuInfo { vendor: "nvidia".into(), name, vram_mb };
        }
    }

    // Fallback: WMI via PowerShell. AdapterRAM is capped at 4 GB (u32) on
    // older Windows WDDM drivers — a known OS limitation we accept.
    let ps_script =
        "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json";
    if let Some(raw) = run_cmd("powershell", &["-NoProfile", "-Command", ps_script]).await {
        if let Some(info) = parse_wmi_json(&raw) {
            return info;
        }
    }

    GpuInfo::unknown()
}

#[cfg(target_os = "windows")]
fn parse_wmi_json(raw: &str) -> Option<GpuInfo> {
    let v: serde_json::Value = serde_json::from_str(raw.trim()).ok()?;
    // PowerShell returns an object when there is one adapter, an array for many.
    let arr: Vec<&serde_json::Value> = if v.is_array() {
        v.as_array()?.iter().collect()
    } else {
        vec![&v]
    };

    for entry in arr {
        let name = entry.get("Name")?.as_str().unwrap_or("").trim().to_string();
        if name.is_empty() { continue; }
        // Skip the Windows fallback software renderer.
        if name.contains("Microsoft Basic Display") { continue; }
        let vendor = vendor_from_name(&name).to_string();
        // AdapterRAM may be null for some virtual adapters.
        let vram_mb = entry
            .get("AdapterRAM")
            .and_then(|r| r.as_u64())
            .map(|b| b / 1_048_576)
            .unwrap_or(0);
        return Some(GpuInfo { vendor, name, vram_mb });
    }
    None
}

// ── macOS ─────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
async fn detect_gpu_impl() -> GpuInfo {
    if let Some(raw) = run_cmd("system_profiler", &["SPDisplaysDataType", "-json"]).await {
        if let Some(info) = parse_system_profiler(&raw) {
            return info;
        }
    }
    GpuInfo::unknown()
}

#[cfg(target_os = "macos")]
fn parse_system_profiler(raw: &str) -> Option<GpuInfo> {
    use sysinfo::System;

    let v: serde_json::Value = serde_json::from_str(raw.trim()).ok()?;
    // JSON shape: { "SPDisplaysDataType": [ { "sppci_model": "...", ... }, ... ] }
    let entries = v.get("SPDisplaysDataType")?.as_array()?;
    let entry = entries.first()?;

    let name = entry
        .get("sppci_model")
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() { return None; }

    let vendor = vendor_from_name(&name).to_string();

    // Discrete GPUs report VRAM under "spdisplays_vram" (e.g. "4 GB").
    // Apple Silicon has unified memory — the OS allocates dynamically so no
    // fixed VRAM figure exists. Use total RAM / 2 as a reasonable upper bound.
    let vram_mb = entry
        .get("spdisplays_vram")
        .and_then(|v| v.as_str())
        .and_then(|s| parse_vram_string(s))
        .unwrap_or_else(|| {
            let mut sys = System::new();
            sys.refresh_memory();
            sys.total_memory() / 2 / 1_048_576
        });

    Some(GpuInfo { vendor, name, vram_mb })
}

/// Parse Apple's display strings like "4 GB", "512 MB", "8 GB".
#[cfg(target_os = "macos")]
fn parse_vram_string(s: &str) -> Option<u64> {
    let s = s.trim().to_ascii_uppercase();
    if let Some(num) = s.strip_suffix(" GB").or_else(|| s.strip_suffix("GB")) {
        let gb: f64 = num.trim().parse().ok()?;
        return Some((gb * 1024.0) as u64);
    }
    if let Some(num) = s.strip_suffix(" MB").or_else(|| s.strip_suffix("MB")) {
        let mb: u64 = num.trim().parse().ok()?;
        return Some(mb);
    }
    None
}

// ── Linux ─────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
async fn detect_gpu_impl() -> GpuInfo {
    // NVIDIA — preferred.
    if let Some(raw) = run_cmd(
        "nvidia-smi",
        &["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    )
    .await
    {
        if let Some((name, vram_mb)) = parse_nvidia_smi(&raw) {
            return GpuInfo { vendor: "nvidia".into(), name, vram_mb };
        }
    }

    // AMD ROCm fallback.
    if let Some(raw) = run_cmd("rocm-smi", &["--showmeminfo", "vram", "--json"]).await {
        if let Some(info) = parse_rocm_json(&raw) {
            return info;
        }
    }

    GpuInfo::unknown()
}

#[cfg(target_os = "linux")]
fn parse_rocm_json(raw: &str) -> Option<GpuInfo> {
    // rocm-smi JSON shape: { "card0": { "0": { "VRAM Total Memory (B)": "...", ... }, ... }, ... }
    // Key names vary by ROCm version; we scan for the first card entry with VRAM info.
    let v: serde_json::Value = serde_json::from_str(raw.trim()).ok()?;
    let map = v.as_object()?;
    for (_card, card_val) in map {
        if let Some(inner) = card_val.as_object() {
            for (_idx, idx_val) in inner {
                if let Some(bytes_str) = idx_val
                    .get("VRAM Total Memory (B)")
                    .and_then(|b| b.as_str())
                {
                    let bytes: u64 = bytes_str.trim().parse().ok()?;
                    let name = idx_val
                        .get("Card series")
                        .and_then(|n| n.as_str())
                        .unwrap_or("AMD GPU")
                        .to_string();
                    return Some(GpuInfo {
                        vendor: "amd".into(),
                        name,
                        vram_mb: bytes / 1_048_576,
                    });
                }
            }
        }
    }
    None
}

// ── Fallback for any other OS ─────────────────────────────────────────

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
async fn detect_gpu_impl() -> GpuInfo {
    GpuInfo::unknown()
}

#[tauri::command]
async fn detect_gpu() -> GpuInfo {
    detect_gpu_impl().await
}


// ─── Voicebox one-click install ──────────────────────────────────────
// Voicebox (github.com/jamiepine/voicebox) ships per-platform installers
// on GitHub Releases. We query the GitHub API for the latest release,
// pick the asset that matches the host OS+arch, stream-download it with
// progress events, then hand it to the OS to run (MSI / DMG / AppImage).
// Same pattern Docker install used; reuses reqwest + futures-util.

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    assets: Vec<GhAsset>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VoiceboxProgress {
    phase: &'static str, // "resolving" | "downloading" | "launching" | "done"
    downloaded: u64,
    total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceboxInstallResult {
    ok: bool,
    phase: String,
    path: String,
    message: String,
    version: String,
}

/// Decide whether an asset name matches the host OS + arch. Returns a
/// priority score (higher = better) and 0 for no match — lets us prefer
/// MSI over EXE on Windows, etc.
fn voicebox_asset_score(name: &str) -> u32 {
    let n = name.to_ascii_lowercase();

    #[cfg(target_os = "windows")]
    {
        let is_x64 = n.contains("x64") || n.contains("x86_64") || n.contains("amd64");
        let is_arm = n.contains("arm64") || n.contains("aarch64");
        #[cfg(target_arch = "x86_64")]
        let arch_match = is_x64 && !is_arm;
        #[cfg(target_arch = "aarch64")]
        let arch_match = is_arm && !is_x64;
        if !arch_match && (is_x64 || is_arm) {
            return 0;
        }
        if n.ends_with(".msi") { return 100; }
        if n.ends_with("-setup.exe") { return 90; }
        if n.ends_with(".exe")  { return 80; }
        return 0;
    }

    #[cfg(target_os = "macos")]
    {
        if !n.ends_with(".dmg") { return 0; }
        let is_arm = n.contains("aarch64") || n.contains("arm64");
        let is_x64 = n.contains("x64") || n.contains("x86_64") || n.contains("amd64") || n.contains("intel");
        #[cfg(target_arch = "aarch64")]
        return if is_arm { 100 } else if !is_x64 { 50 } else { 0 };
        #[cfg(target_arch = "x86_64")]
        return if is_x64 { 100 } else if !is_arm { 50 } else { 0 };
    }

    #[cfg(target_os = "linux")]
    {
        let is_x64 = n.contains("amd64") || n.contains("x86_64") || n.contains("x64");
        let is_arm = n.contains("aarch64") || n.contains("arm64");
        #[cfg(target_arch = "x86_64")]
        let arch_match = is_x64 && !is_arm;
        #[cfg(target_arch = "aarch64")]
        let arch_match = is_arm && !is_x64;
        if !arch_match && (is_x64 || is_arm) {
            return 0;
        }
        if n.ends_with(".appimage") { return 100; }
        if n.ends_with(".deb") { return 80; }
        if n.ends_with(".rpm") { return 70; }
        return 0;
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = n;
        0
    }
}

#[tauri::command]
async fn voicebox_install(app: AppHandle) -> VoiceboxInstallResult {
    use futures_util::StreamExt;
    use std::io::Write;

    let _ = app.emit("voicebox-install-progress", VoiceboxProgress {
        phase: "resolving", downloaded: 0, total: 0,
    });

    // 1. Resolve the latest release via the GitHub API.
    let client = match reqwest::Client::builder()
        .user_agent("JustWrite/1.0 (voicebox installer)")
        .timeout(std::time::Duration::from_secs(60))
        .build()
    {
        Ok(c) => c,
        Err(e) => return VoiceboxInstallResult {
            ok: false, phase: "error".into(), path: String::new(), version: String::new(),
            message: format!("HTTP client init failed: {e}"),
        },
    };
    let release: GhRelease = match client
        .get("https://api.github.com/repos/jamiepine/voicebox/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send().await
    {
        Ok(r) if r.status().is_success() => match r.json().await {
            Ok(j) => j,
            Err(e) => return VoiceboxInstallResult {
                ok: false, phase: "error".into(), path: String::new(), version: String::new(),
                message: format!("could not parse GitHub release JSON: {e}"),
            },
        },
        Ok(r) => return VoiceboxInstallResult {
            ok: false, phase: "error".into(), path: String::new(), version: String::new(),
            message: format!("GitHub API returned HTTP {}", r.status()),
        },
        Err(e) => return VoiceboxInstallResult {
            ok: false, phase: "error".into(), path: String::new(), version: String::new(),
            message: format!("could not reach GitHub API: {e}"),
        },
    };

    // 2. Pick the best matching asset for this host.
    let asset = match release.assets.iter()
        .map(|a| (voicebox_asset_score(&a.name), a))
        .filter(|(score, _)| *score > 0)
        .max_by_key(|(score, _)| *score)
        .map(|(_, a)| a)
    {
        Some(a) => a,
        None => {
            // No matching asset — fall back to the releases page in the browser.
            let _ = open::that("https://github.com/jamiepine/voicebox/releases/latest");
            return VoiceboxInstallResult {
                ok: true, phase: "browser-fallback".into(),
                path: String::new(), version: release.tag_name.clone(),
                message: "No installer asset matched your platform. Opened the voicebox releases page so you can pick one manually.".into(),
            };
        }
    };

    // 3. Download to temp with progress.
    let install_path = std::env::temp_dir().join(&asset.name);
    let res = match client.get(&asset.browser_download_url).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => return VoiceboxInstallResult {
            ok: false, phase: "error".into(),
            path: install_path.display().to_string(), version: release.tag_name,
            message: format!("download failed: HTTP {}", r.status()),
        },
        Err(e) => return VoiceboxInstallResult {
            ok: false, phase: "error".into(),
            path: install_path.display().to_string(), version: release.tag_name,
            message: format!("download failed: {e}"),
        },
    };

    let total = res.content_length().unwrap_or(asset.size);
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut file = match std::fs::File::create(&install_path) {
        Ok(f) => f,
        Err(e) => return VoiceboxInstallResult {
            ok: false, phase: "error".into(),
            path: install_path.display().to_string(), version: release.tag_name,
            message: format!("can't write installer to {}: {e}", install_path.display()),
        },
    };
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                if let Err(e) = file.write_all(&bytes) {
                    return VoiceboxInstallResult {
                        ok: false, phase: "error".into(),
                        path: install_path.display().to_string(), version: release.tag_name,
                        message: format!("write error: {e}"),
                    };
                }
                downloaded = downloaded.saturating_add(bytes.len() as u64);
                if downloaded - last_emit > 256 * 1024 || downloaded == total {
                    last_emit = downloaded;
                    let _ = app.emit("voicebox-install-progress", VoiceboxProgress {
                        phase: "downloading", downloaded, total,
                    });
                }
            }
            Err(e) => return VoiceboxInstallResult {
                ok: false, phase: "error".into(),
                path: install_path.display().to_string(), version: release.tag_name,
                message: format!("download read failed: {e}"),
            },
        }
    }
    if let Err(e) = file.sync_all() {
        return VoiceboxInstallResult {
            ok: false, phase: "error".into(),
            path: install_path.display().to_string(), version: release.tag_name,
            message: format!("flush failed: {e}"),
        };
    }
    drop(file);

    let _ = app.emit("voicebox-install-progress", VoiceboxProgress {
        phase: "launching", downloaded, total: downloaded.max(total),
    });

    // 4. Hand off to the OS. On Windows the MSI/EXE spawns and asks for
    // admin if needed; on macOS `open` mounts the DMG and the user drags
    // Voicebox.app into /Applications; on Linux .AppImage is made
    // executable and launched.
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if install_path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("appimage")).unwrap_or(false) {
            if let Ok(meta) = std::fs::metadata(&install_path) {
                let mut perms = meta.permissions();
                perms.set_mode(perms.mode() | 0o111);
                let _ = std::fs::set_permissions(&install_path, perms);
            }
        }
    }
    if let Err(e) = open::that(&install_path) {
        return VoiceboxInstallResult {
            ok: false, phase: "error".into(),
            path: install_path.display().to_string(), version: release.tag_name,
            message: format!("could not launch installer: {e}"),
        };
    }

    let _ = app.emit("voicebox-install-progress", VoiceboxProgress {
        phase: "done", downloaded, total: downloaded.max(total),
    });

    VoiceboxInstallResult {
        ok: true, phase: "launched".into(),
        path: install_path.display().to_string(),
        version: release.tag_name.clone(),
        message: voicebox_launched_message(),
    }
}

#[cfg(target_os = "windows")]
fn voicebox_launched_message() -> String {
    "Voicebox installer is running. Follow its prompts; once Voicebox starts, click Refresh here. JustWrite will detect the server on port 8000.".into()
}
#[cfg(target_os = "macos")]
fn voicebox_launched_message() -> String {
    "Voicebox disk image opened. Drag Voicebox into Applications, then launch it. Once it's running, click Refresh.".into()
}
#[cfg(target_os = "linux")]
fn voicebox_launched_message() -> String {
    "Voicebox AppImage launched. If your distro asks where to integrate it, follow the prompts. Once Voicebox is running, click Refresh.".into()
}
#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn voicebox_launched_message() -> String {
    "Opened the voicebox releases page in your browser.".into()
}

// ─── Runner ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            project_save,
            project_save_to,
            project_open,
            project_autosave,
            project_autosave_dir,
            project_autosave_list,
            project_autosave_read,
            images_save,
            images_read,
            images_delete,
            open_external,
            shell_save_file,
            audio_save,
            audio_delete,
            audio_clear_project,
            audio_save_as,
            tts_edge_voices,
            tts_edge_speech,
            detect_gpu,
            pick_directory,
            voicebox_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

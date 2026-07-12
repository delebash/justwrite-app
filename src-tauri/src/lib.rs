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
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager, WindowEvent,
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
    // Under the portable data root (was app_data_dir()) so autosaves move with
    // everything else when the user relocates their data.
    let mut p = resolve_data_root(app);
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

// ─── Storage location (the portable data root — user-settable) ───────────────
// The renderer's Settings → Storage reads storage_get_root, uses the existing
// pick_directory to choose a folder, then storage_relocate moves everything.

#[derive(Serialize)]
struct StorageRoot {
    root: String,
    default: String,
    portable: bool,
}

#[tauri::command]
fn storage_get_root(app: AppHandle) -> StorageRoot {
    let root = resolve_data_root(&app);
    let portable = exe_dir().map(|d| root.starts_with(&d)).unwrap_or(false);
    StorageRoot {
        default: default_data_root(&app).to_string_lossy().into_owned(),
        portable,
        root: root.to_string_lossy().into_owned(),
    }
}

// async so the (possibly multi-GB) copy runs off the main/UI thread, matching the
// other heavy-IO commands.
#[tauri::command]
async fn storage_relocate(app: AppHandle, new_path: String) -> Result<(), String> {
    let new_root = PathBuf::from(new_path.trim());
    if new_root.as_os_str().is_empty() {
        return Err("empty path".into());
    }
    let old_root = resolve_data_root(&app);
    if new_root == old_root {
        return Ok(());
    }
    if !dir_is_writable(new_root.parent().unwrap_or(&new_root)) {
        return Err(format!("cannot write to {}", new_root.display()));
    }
    // Stop the server so nothing holds justwrite.db open during the move.
    if let Some(state) = app.try_state::<SidecarState>() {
        state.kill_child();
    }
    wait_for_port_free(SERVER_PORT, Duration::from_secs(5));

    let outcome = relocate_data(&app, &old_root, &new_root);

    // ALWAYS bring a server back up — under the new root on success, the old root
    // on failure — so a failed move never leaves the app serverless.
    let serve_root = if outcome.is_ok() { &new_root } else { &old_root };
    if let Some(state) = app.try_state::<SidecarState>() {
        state.set_child(spawn_sidecar(serve_root).ok().flatten());
    }
    outcome
}

// Crash-safe move. Data is never lost: old_root is deleted only AFTER the pointer
// commit, so a crash before the commit leaves the old root intact + resolvable.
fn relocate_data(
    app: &AppHandle,
    old_root: &std::path::Path,
    new_root: &std::path::Path,
) -> Result<(), String> {
    // Staging is a SIBLING of new_root (same volume → the finalize rename is
    // atomic). Append `.jw_moving` to the FULL folder name — with_extension would
    // clobber a dot already in the name (e.g. `Books.v2` → `Books.jw_moving`).
    let name = new_root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".to_string());
    let staging = new_root.with_file_name(format!("{name}.jw_moving"));
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    copy_dir_all(old_root, &staging).map_err(|e| format!("copy failed: {e}"))?;
    fs::rename(&staging, new_root).map_err(|e| format!("finalize failed: {e}"))?;
    // THE commit point — atomic pointer write (tmp + rename inside).
    write_data_root_pointer(app, new_root).map_err(|e| format!("pointer write failed: {e}"))?;
    let _ = fs::remove_dir_all(old_root); // redundant now; the pointer already committed
    Ok(())
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
    let default_dir = decode_b64_header("x-save-dir").unwrap_or_default();

    let mut dialog = app
        .dialog()
        .file()
        .set_title(&title)
        .set_file_name(&suggested);
    if !default_dir.is_empty() {
        dialog = dialog.set_directory(&default_dir);
    }
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

// ─── Native "open a file" dialog ─────────────────────────────────────
// Returns the picked file's bytes (base64) + its folder, so the renderer can
// upload them to the server (e.g. picking a `<book>.zip` to import). `dir` comes
// back so each chooser can remember its own last location.

#[tauri::command]
async fn pick_file(
    app: AppHandle,
    title: Option<String>,
    filter_name: Option<String>,
    filter_ext: Option<String>,
    default_dir: Option<String>,
) -> Result<Value, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title(&title.unwrap_or_else(|| "Open file".to_string()));
    if let Some(ext) = filter_ext.as_deref().filter(|s| !s.is_empty()) {
        let exts: Vec<&str> = ext.split(',').filter(|s| !s.is_empty()).collect();
        if !exts.is_empty() {
            dialog = dialog.add_filter(&filter_name.unwrap_or_else(|| "File".to_string()), &exts);
        }
    }
    if let Some(d) = default_dir.as_deref().filter(|s| !s.is_empty()) {
        dialog = dialog.set_directory(d);
    }

    let Some(file_path) = dialog.blocking_pick_file() else {
        return Err("cancelled".into());
    };
    let path_buf: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
    let bytes = fs::read(&path_buf).map_err(|e| e.to_string())?;
    let name = path_buf.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
    let dir = path_buf.parent().map(|p| p.display().to_string()).unwrap_or_default();
    Ok(serde_json::json!({
        "name": name,
        "dir": dir,
        "dataBase64": base64::engine::general_purpose::STANDARD.encode(&bytes),
    }))
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

// ─── Python server sidecar ───────────────────────────────────────────
// JustWrite is now a thin client: all data lives in the Python `server/`
// (FastAPI + SQLite on :17495). The desktop shell must spawn that server on
// startup — without it the renderer's boot-time health check fails and shows
// the connection-error screen. Mirrors JustVoice's sidecar (kept in lock-step;
// JustVoice is the precedent), trimmed to JustWrite's needs: a single window
// with no tray, so closing it quits the app and tears the server down.

// ─── Data root (the portable, user-settable location for ALL app data) ───────
// Resolved by the shell BEFORE the server spawns (the server owns the DB + logs
// and the runner cache under it, via JUSTWRITE_DATA_DIR). Default = a `data/`
// folder beside the app when writable (portable, like VS Code Portable Mode),
// else the OS app-data dir so a Program-Files / read-only-bundle install never
// fails. A tiny `dataroot.txt` pointer, kept OUTSIDE the relocatable root,
// records a user override; storage_relocate moves everything then flips it.

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.to_path_buf()))
}

fn dir_is_writable(dir: &std::path::Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".jw_write_probe");
    match fs::write(&probe, b"x") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn default_data_root(app: &AppHandle) -> PathBuf {
    if let Some(dir) = exe_dir() {
        if dir_is_writable(&dir) {
            return dir.join("data");
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("JustWrite-data"))
}

// Where the override pointer may live — beside the exe (portable) first, then the
// OS config dir. Reading tries each; writing picks the first writable one.
fn pointer_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(dir) = exe_dir() {
        v.push(dir.join("dataroot.txt"));
    }
    if let Ok(cfg) = app.path().app_config_dir() {
        v.push(cfg.join("dataroot.txt"));
    }
    v
}

fn resolve_data_root(app: &AppHandle) -> PathBuf {
    for p in pointer_candidates(app) {
        if let Ok(s) = fs::read_to_string(&p) {
            let root = PathBuf::from(s.trim());
            if !root.as_os_str().is_empty() {
                return root;
            }
        }
    }
    default_data_root(app)
}

fn write_data_root_pointer(app: &AppHandle, root: &std::path::Path) -> std::io::Result<()> {
    let pointer = pointer_candidates(app)
        .into_iter()
        .find(|p| p.parent().map(dir_is_writable).unwrap_or(false))
        .unwrap_or_else(|| PathBuf::from("dataroot.txt"));
    if let Some(parent) = pointer.parent() {
        fs::create_dir_all(parent)?;
    }
    // Atomic: write a temp sibling then rename OVER the pointer, so a torn write
    // (e.g. crash mid-relocation) can never strand the app on a half-written path.
    let tmp = pointer.with_extension("tmp");
    fs::write(&tmp, root.to_string_lossy().as_bytes())?;
    fs::rename(&tmp, &pointer)
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

const SERVER_PORT: u16 = 17495;

struct SidecarState {
    child: Mutex<Option<Child>>,
}

impl SidecarState {
    fn new(child: Option<Child>) -> Self {
        Self { child: Mutex::new(child) }
    }

    fn kill_child(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }

    // Replace the running sidecar (storage_relocate: stop → move data → respawn
    // under the new root).
    fn set_child(&self, child: Option<Child>) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut old) = guard.take() {
                let _ = old.kill();
            }
            *guard = child;
        }
    }
}

fn spawn_sidecar(data_root: &std::path::Path) -> std::io::Result<Option<Child>> {
    // Escape hatch: run the server yourself (`npm run server`) and set this so
    // the shell doesn't spawn a duplicate / evict your manual one.
    if std::env::var("JUSTWRITE_DEV_NO_SIDECAR").is_ok() {
        return Ok(None);
    }

    if port_in_use(SERVER_PORT) {
        eprintln!(
            "[sidecar] port {SERVER_PORT} already in use — evicting the stale \
             listener before spawning a fresh server"
        );
        kill_listeners_on_port(SERVER_PORT);
        if !wait_for_port_free(SERVER_PORT, Duration::from_secs(5)) {
            eprintln!(
                "[sidecar] port {SERVER_PORT} still occupied after eviction; reusing \
                 the existing server — kill it manually if the UI shows stale data"
            );
            return Ok(None);
        }
        eprintln!("[sidecar] port {SERVER_PORT} freed");
    }

    // IMPORTANT: spawn `justwrite-server`, never an unqualified `justwrite` —
    // the Tauri binary is also `justwrite(.exe)`, and Windows CreateProcessW
    // searches the running binary's directory first, so that name resolves to
    // OUR binary, spawning a new desktop window in an infinite loop.
    // The server reads its data dir from JUSTWRITE_DATA_DIR (cli.py serve envvar) —
    // uniform across all spawn arms, so all app data lands under the portable root.
    let child = if cfg!(debug_assertions) {
        match Command::new("justwrite-server")
            .arg("serve")
            .env("JUSTWRITE_DATA_DIR", data_root)
            .spawn()
        {
            Ok(child) => child,
            Err(_) => Command::new("python")
                .args(["-m", "justwrite_server.cli", "serve"])
                .env("JUSTWRITE_DATA_DIR", data_root)
                .spawn()?,
        }
    } else {
        let exe = std::env::current_exe()?;
        let dir = exe.parent().unwrap_or_else(|| std::path::Path::new("."));
        let bin = if cfg!(windows) {
            dir.join("justwrite-server.exe")
        } else {
            dir.join("justwrite-server")
        };
        Command::new(bin)
            .env("JUSTWRITE_DATA_DIR", data_root)
            .spawn()?
    };

    std::thread::spawn(|| {
        if wait_for_port_up(SERVER_PORT, Duration::from_secs(15)) {
            eprintln!("[sidecar] server listening on {SERVER_PORT}");
        } else {
            eprintln!(
                "[sidecar] warning: server is not listening on {SERVER_PORT} after \
                 15s — the UI may show the connection-error screen. Check the server log."
            );
        }
    });

    Ok(Some(child))
}

fn port_in_use(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn wait_for_port_free(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if !port_in_use(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    !port_in_use(port)
}

fn wait_for_port_up(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if port_in_use(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    port_in_use(port)
}

#[cfg(windows)]
fn kill_listeners_on_port(port: u16) {
    let output = match Command::new("netstat").args(["-ano"]).output() {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[sidecar] netstat failed, cannot evict stale server: {e}");
            return;
        }
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let needle = format!(":{port}");
    let mut pids = std::collections::HashSet::new();
    for line in text.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 5 || cols[0] != "TCP" || !cols.contains(&"LISTENING") {
            continue;
        }
        if !cols[1].ends_with(&needle) {
            continue;
        }
        if let Ok(pid) = cols[cols.len() - 1].parse::<u32>() {
            if pid != 0 {
                pids.insert(pid);
            }
        }
    }
    for pid in pids {
        eprintln!("[sidecar] killing stale listener on :{port} (PID {pid})");
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
}

#[cfg(not(windows))]
fn kill_listeners_on_port(port: u16) {
    let output = match Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[sidecar] lsof failed, cannot evict stale server: {e}");
            return;
        }
    };
    let text = String::from_utf8_lossy(&output.stdout);
    for pid in text.lines().map(str::trim).filter(|p| !p.is_empty()) {
        eprintln!("[sidecar] killing stale listener on :{port} (PID {pid})");
        let _ = Command::new("kill").args(["-9", pid]).output();
    }
}

// ─── Runner ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Resolve the (portable, user-settable) data root with Tauri's OWN
            // path resolver — that needs the AppHandle, so it runs here rather
            // than a pre-builder body — then bring the server up UNDER that root
            // before the webview's connection gate probes it. Lock the choice
            // into the pointer on first run so later resolves are cheap reads.
            let handle = app.handle().clone();
            let root = resolve_data_root(&handle);
            if pointer_candidates(&handle).iter().all(|p| !p.exists()) {
                let _ = write_data_root_pointer(&handle, &root);
            }
            let sidecar = match spawn_sidecar(&root) {
                Ok(child) => SidecarState::new(child),
                Err(e) => {
                    eprintln!("Failed to spawn Python sidecar: {e}");
                    SidecarState::new(None)
                }
            };
            app.manage(sidecar);
            Ok(())
        })
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
            detect_gpu,
            pick_directory,
            pick_file,
            storage_get_root,
            storage_relocate,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                // Single window, no tray: closing it quits the app, so tear the
                // sidecar down with it instead of leaking a Python process.
                if let Some(state) = window.app_handle().try_state::<SidecarState>() {
                    state.kill_child();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

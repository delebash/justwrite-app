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
    AppHandle, Manager,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============================================================
// JustWrite — Tauri 2 backend commands.
//
// Exposes the `window.justwrite` (shell / storage) API the Vue app calls,
// routing each call through Tauri's invoke().
// ============================================================

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use std::{fs, path::PathBuf};
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

// ─── Folder picker ───────────────────────────────────────────────────
// Used by Settings → AI providers → Install Docker Desktop → Advanced
// options → custom install location. Every native dialog routes through a
// Rust command instead of the JS plugin so we keep a single capability surface.

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
// raw IPC body (zero-copy); the suggested filename and a single file-type
// filter come in as base64 headers.

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

// D5 (2026-07-13): re-entry guard for the CloseRequested drain grace. The FIRST
// close is held briefly so an in-flight keepalive autosave/DB POST can reach the
// sidecar before it dies; the second (programmatic) close proceeds.
static CLOSING: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // Remember the window size + position across launches — the plugin saves
        // on close and restores on start automatically (no JS/capability needed).
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
            open_external,
            shell_save_file,
            pick_directory,
            pick_file,
            storage_get_root,
            storage_relocate,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Single window, no tray: closing it quits the app, so tear the
                // sidecar down with it instead of leaking a Python process.
                //
                // D5 (2026-07-13): the disk autosave + DB save now flush over HTTP
                // to the Python sidecar (keepalive fetch on pagehide). Killing the
                // sidecar the instant the window closes can race that in-flight
                // POST, so on the FIRST close we hold the window ~400ms to let the
                // request drain, THEN kill the sidecar and close for real.
                // Best-effort: an abrupt OS-level kill still loses up to the last
                // ~10s autosave-debounce window (documented tradeoff — the same
                // close-fragility the DB save already had). The re-entry guard lets
                // the second (programmatic) close go through.
                if CLOSING.swap(true, Ordering::SeqCst) {
                    return; // second pass — allow the close to proceed
                }
                api.prevent_close();
                let win = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(400));
                    if let Some(state) = win.app_handle().try_state::<SidecarState>() {
                        state.kill_child();
                    }
                    let _ = win.close();
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

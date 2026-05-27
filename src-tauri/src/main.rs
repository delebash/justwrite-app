// JustWrite — Tauri entry point.
// All logic lives in the library so `cargo test`, the mobile targets,
// and this binary all use the same code path.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    justwrite_lib::run();
}

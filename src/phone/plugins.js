// SPDX-License-Identifier: MIT
// The phone's native pieces, on Capacitor's official plugins (MIT): saving a file through the
// share sheet (@capacitor/filesystem + @capacitor/share), scanning a pairing code
// (@capacitor/barcode-scanner), and the files the in-app server asks the window for — this device's
// id and the storage guard's folder (the kit's `callWindow`; the guard: the kit's
// docs/plans/2026-10-08-the-phone.md §2 and JustWrite's TASKS, Sync decision 7).
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from "@capacitor/barcode-scanner";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * Save-as on the phone: the file is written to the app's cache and handed to the share sheet
 * (save to Files, send by mail, …). Resolves `{ ok, path }`, or null when the sheet was dismissed.
 */
export async function saveFile({ blob, suggestedName }) {
  const name = String(suggestedName || "export").replace(/[\\/:*?"<>|]+/g, " ").trim() || "export";
  const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
  const { uri } = await Filesystem.writeFile({ path: `exports/${name}`, data, directory: Directory.Cache, recursive: true });
  try {
    await Share.share({ title: name, files: [uri] });
  } catch (e) {
    if (/cancel/i.test(String(e?.message ?? e))) return null;
    throw e;
  }
  return { ok: true, path: uri };
}

/** Scan a QR code with the camera; resolves its text, or null when cancelled or unreadable. */
export async function scanCode() {
  try {
    const r = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE });
    return r?.ScanResult || null;
  } catch {
    return null;
  }
}

// ── what the in-app server asks for (its callWindow ops) ───────────────────────────────

const GUARD = "sync-guard";
const IDENTITY = "sync-device.json";
const guardPath = (p) => [GUARD, p].filter(Boolean).join("/");
const missing = (e) => /not exist|no such|not found|ENOENT/i.test(String(e?.message ?? e));

export const workerCalls = {
  /** This device's sync id, kept in the app's own files — outside the database, so a phone whose
   * database was lost is still the same device and rebuilds from its guard (sync-device.json, as
   * on a computer). */
  async "device.id"() {
    try {
      const { data } = await Filesystem.readFile({ path: IDENTITY, directory: Directory.Data, encoding: Encoding.UTF8 });
      const id = JSON.parse(data)?.id;
      if (typeof id === "string" && id) return id;
    } catch (e) {
      if (!missing(e)) throw e;
    }
    const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await Filesystem.writeFile({ path: IDENTITY, data: JSON.stringify({ id }), directory: Directory.Data, encoding: Encoding.UTF8 });
    return id;
  },
  async "guard.list"({ dir }) {
    try {
      const { files } = await Filesystem.readdir({ path: guardPath(dir), directory: Directory.Data });
      return files.map((f) => (typeof f === "string" ? f : f.name)).filter((n) => !n.endsWith(".tmp"));
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
  },
  async "guard.read"({ path }) {
    try {
      return fromBase64((await Filesystem.readFile({ path: guardPath(path), directory: Directory.Data })).data);
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  },
  async "guard.write"({ path, bytes }) {
    await Filesystem.writeFile({ path: guardPath(path), data: toBase64(bytes), directory: Directory.Data, recursive: true });
  },
  async "guard.remove"({ path }) {
    try {
      await Filesystem.deleteFile({ path: guardPath(path), directory: Directory.Data });
    } catch (e) {
      if (!missing(e)) throw e;
    }
  },
};

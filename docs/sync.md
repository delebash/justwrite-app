# Sync — your books on every device

JustWrite keeps your books on each of your computers (and, soon, your phone), and sync carries
your changes between them. Every device works with no network at all — sync catches it up the next
time it can reach another device. Nothing ever asks you to choose between two versions: if you add a
paragraph on one device and fix a typo in the same scene on another, both survive.

You'll find it in **Settings → Sync**.

What syncs: your books — the manuscript, the story bible, images and saved versions. What stays on
each device: settings, AI providers and keys, writing statistics and the search index.

---

## Pick the way that suits you

| Way | When | What you do |
|---|---|---|
| **Cloud folder** | anywhere; the other computer can be off | On each computer, choose the same folder inside Dropbox, OneDrive or another sync app. |
| **Pairing** | same Wi-Fi, or over Tailscale / ZeroTier | Turn on *Let my other devices connect* on one computer, then pair the other with its code. |
| **By hand** | no network, no accounts | Export a file, carry it over (email, a USB stick, anything), import it on the other device. |

You can use more than one: a cloud folder for everyday work and a file by hand when you're away from
both.

---

## Your devices

**This device** shows the name your other devices see (it starts as your computer's name — change it
to something like "Study laptop"), and how often JustWrite syncs on its own while it's open (every 5
minutes unless you change it; 0 means only when you press **Sync now**).

The line at the top tells you when this device last synced, and with which device — for example
*"Synced 2 min ago · from Study laptop"*. **Devices** lists every device this one has synced with, and
how: by hand, the cloud folder, or the network.

---

## A cloud folder

1. On your first computer: **Settings → Sync → Cloud folder → Choose folder…**, and pick a folder
   inside your Dropbox or OneDrive (for example `Dropbox/JustWrite`).
2. Pair your second computer with the first (see *Pairing* below) — that gives it the library's
   key. If the first computer is off, pairing still works: the second one joins with the code and
   the folder carries the changes.
3. On the second computer, choose the same folder.

Each device writes only its own files into the folder, and they're encrypted with your library's
key, so the folder's contents are unreadable to anyone without it. Dropbox or OneDrive moves the
files; JustWrite reads them shortly after it starts, every few minutes while it's open, and when
you press **Sync now**.

Your live database never goes into the cloud folder — only these change files do, which is why two
computers can't corrupt each other through it.

If the folder you choose already holds another library, JustWrite tells you which devices it comes
from: pair with a code from one of them first, so your books join that library instead of starting a
second one beside it.

---

## Pairing

On the computer that has your books:

1. **Settings → Sync → Other devices**: turn on **Let my other devices connect**. JustWrite then
   accepts connections from your other devices — restart it once for this to take effect, and allow
   it through Windows Firewall when Windows asks.
2. Press **Show pairing code**. You get a QR code and the same code as text.

On the other device: **Settings → Sync → Pair with a code**, paste the code, press **Pair**. The two
sync at once, and again every few minutes while both are open.

The code carries your library's key and a password for this computer — share it only with your own
devices.

### Over the internet: Tailscale or ZeroTier

Pairing works across the same Wi-Fi out of the box. To pair a device that's somewhere else (your
laptop at home, you at a café), install **[Tailscale](https://tailscale.com)** or
**[ZeroTier](https://www.zerotier.com)** on both devices and sign in to the same account. They give
each device a private address that works from anywhere; JustWrite's pairing code includes that
address when one is present. Nothing else to set up — your devices then talk to each other directly,
encrypted by Tailscale or ZeroTier.

### Without Dropbox or OneDrive: Syncthing

**[Syncthing](https://syncthing.net)** keeps a folder the same on several devices with no cloud
account at all. Point it at a folder, then choose that folder as JustWrite's cloud folder on each
computer. (Android only among phones, for now.)

---

## By hand

1. **Settings → Sync → By hand**. The books you changed since your last export are already ticked.
2. Optional: tick **Encrypt the file with this library's key** if the file will travel somewhere you
   don't trust.
3. **Export…** saves a `.jwsync` file. Send it any way you like.
4. On the other device: **Import…** and pick the file. It merges — importing the same file twice, or
   an older one, changes nothing that's newer.

If the file comes from a device that hasn't synced with this one before, JustWrite asks whether to
join that device's library. Say yes, and your books on both devices become one library from then on.

---

## Good to know

- **Resetting the workspace** starts a new library on this device — pair your other devices with it
  again.
- **Restoring a backup** counts as an edit on this device: the restored books sync to your other
  devices like any other change.
- **Sync isn't a backup.** A deleted chapter is deleted everywhere. Keep using
  [Backups](backups-and-data.md).
- Sync needs JustWrite open on the devices taking part; the cloud folder lets them take turns.

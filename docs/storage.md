# Storage & the local engine

## Where JustWrite keeps your data

Everything JustWrite saves lives in **one folder** — your projects, images, the
local AI engine and any downloaded models, and logs. By default that folder sits
**next to the app**, so a portable install carries its data with it. If the app
is installed somewhere the system won't let it write (like Windows *Program
Files*), it falls back to your user data folder instead.

You can see the current location under **Settings → Storage**.

## Moving your data to another folder

In **Settings → Storage**, click **Change folder…**, pick a new location, and
confirm. JustWrite moves everything to the new folder and restarts.

Your work is never at risk: the move only takes effect once the copy has fully
finished, and if anything goes wrong the app keeps using the old folder. Large
model files make the move take a while — that's expected.

## Reclaiming disk space

The **Disk usage** card under **Settings → Storage** shows where your data
folder's space goes: the downloaded AI models, the local engine, the server
logs, the engine's own start-up logs, and your project database — plus how much
free space the disk has left.

Two of those can be cleared right from the card:

- **Models cache — Clear…** removes the downloaded model files. This is always
  safe: your models stay in the catalog and simply re-download the next time
  they're used. If a model is currently loaded, JustWrite asks you to unload it
  first (on the AI page) before clearing. This is usually where most of the
  space goes — model files run to several gigabytes each.
- **Engine spawn logs — Clear…** removes the local engine's start-up logs.
  They're only useful when diagnosing a model that won't load, and they
  accumulate over time.

The other rows are managed where they live: the **engine** itself is installed,
updated, and removed on the AI page; the **server logs** have their own
retention controls in **Settings → Logs**; and the **database** is your actual
work — it's never cleared from here.

## The local AI engine

The bundled local models run on a small **llama.cpp engine**. Installing it is
its own one-time step, separate from downloading a model: open **Settings → AI →
Providers & models**, open the built-in provider, and use **Install engine**
under *Local engine*. Once it's installed, downloading and loading a model just
works — if a model won't load with an "install engine first" note, the engine
step is what's missing.

If a model ever fails to start, **View log** on that panel shows the engine's own
output so you can see why (for example, a graphics-driver or out-of-memory error).

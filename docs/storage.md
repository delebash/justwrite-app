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

## The local AI engine

The bundled local models run on a small **llama.cpp engine**. Installing it is
its own one-time step, separate from downloading a model: open **Settings → AI →
Providers & models**, open the built-in provider, and use **Install engine**
under *Local engine*. Once it's installed, downloading and loading a model just
works — if a model won't load with an "install engine first" note, the engine
step is what's missing.

If a model ever fails to start, **View log** on that panel shows the engine's own
output so you can see why (for example, a graphics-driver or out-of-memory error).

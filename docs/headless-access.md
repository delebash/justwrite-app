# Headless access

JustWrite's server can run on its own, without the desktop window. Point a
browser at it and you get the full app — same projects, same AI, no desktop
install on that machine.

That's useful when you want to write from a laptop or tablet while your books
and your local AI models stay on one machine, or when you keep the app running
on a home server and just open a tab.

## Opening JustWrite in a browser

Under **Settings → Server**, the **Headless access** card shows the address the
server is hosting the app at, with a **Copy** button. Paste it into any browser
on the same machine and JustWrite loads.

The same section carries **Keep server running after the app closes**: with it
on, closing the window hides JustWrite to the system tray and the server keeps
serving — left-click the tray icon to bring the window back. The tray menu
carries 📺 Show / 🔵 Hide window, ▶️ Start / ⏹ Stop / 🔄 Restart server,
⚙️ Open settings, 📋 Copy server URL (copies and confirms), 📜 Open log file,
ℹ️ About, and 🚪 Quit — which stops the server too. With the switch off,
closing the window stops everything.

By default that's `http://127.0.0.1:17495/` — which only accepts connections
from the machine it's running on. To reach it from another device, see
*Running the server yourself* below.

## Running the server yourself

You don't have to open the desktop app at all. On Windows the installer puts a
command called **`justwrite-server`** beside JustWrite in the install folder. From that
folder, run:

```
justwrite-server serve
```

It starts on `127.0.0.1:17495` and prints the address to open. It is the same server the
desktop app runs, on the same data folder — only without the window.

On macOS and Linux there is no separate command yet: run the app's own program with the
environment variable `ELECTRON_RUN_AS_NODE=1`, followed by the path to
`resources/app.asar/server/src/serve.js` inside the installed app (`Contents/Resources/…` in
the macOS app bundle) and the same options. From a
copy of the source code, `npm run server` does it for you (options go after `--`).

Three options let you change that:

- `--host` — which addresses to accept connections on. Use `--host 0.0.0.0` to
  allow other devices on your network. **Read the next section first.**
- `--port` — the port number, if 17495 is taken.
- `--data-dir` — which folder to read your work from (see
  [Storage & engine](storage.md)).

For example, to serve your books to the rest of your home network:

```
justwrite-server serve --host 0.0.0.0
```

Leave the desktop app closed while doing this — both use the same port.

## API access (bearer tokens)

The **API access** card, also under **Settings → Server**, controls who may
call JustWrite's API.

It is **off by default**, which is the right setting when the server only
listens on your own machine — nothing else can reach it anyway.

The moment you serve beyond that machine with `--host`, turn it on. Click
**Generate** for a random token (or paste your own), then **Add token**.
After that every API request must carry that token, and anything without it is
refused. Add as many tokens as you like and remove any of them later.

Two things worth knowing:

- **Connections from the machine itself skip the check**, so the desktop app
  keeps working normally. If you'd rather require a token even there, switch on
  **Require a token even on localhost**.
- **The app itself always loads.** Tokens guard the API, not the page — so a
  browser can always reach JustWrite and sign in.

Treat a token like a password: anyone holding one can read and change
everything in your library.

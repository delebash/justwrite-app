---
lede: Run the server on its own and use JustWrite in a browser
---
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

**Several windows at once.** The desktop window and any browser tabs on the same server all show
the same books. A change made in one shows up in the others within a few seconds, but not while
you're typing there or a dialog is open: it waits until you click out of the text. Restoring a
backup or resetting the workspace in one window reloads the others.

## Running the server yourself

You don't have to open the desktop app at all. On Windows the installer puts a
command called **`justwrite-server`** beside JustWrite in the install folder. From that
folder, run:

```
justwrite-server serve
```

It starts on `127.0.0.1:17495` and prints the address to open. It is the same server the
desktop app runs, on the same data folder — only without the window.

On macOS and Linux the command is **`justwrite-server`** too: on Linux it sits beside the
`justwrite` program (for the AppImage, run the AppImage with `--appimage-extract` first; the
command is then in the `squashfs-root` folder it makes), and on macOS it is inside the app, in
`JustWrite.app/Contents/Resources`. From a copy of the source code, `npm run server` does it for
you (options go after `--`).

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

### Behind a reverse proxy

The server answers only to this computer's own names — `localhost`, its IP addresses and its
computer name — so a web page can't trick your browser into reaching it under another name. If
you put it behind a reverse proxy on the same computer (nginx, Caddy) that serves it under a
public name, set the environment variable **`JUSTWRITE_ALLOWED_HOSTS`** to that name before
starting the server, for example `JUSTWRITE_ALLOWED_HOSTS=write.example.com` (several names are
separated by commas). Without it, requests for that name are refused.

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
  **Require a token even on localhost**: the window you switch it on in keeps one
  of your tokens, so it stays signed in.
- **The app itself always loads.** Tokens guard the API, not the page — so a
  browser can always reach JustWrite and sign in: on another computer the page
  asks for an access token; paste one of yours and **Connect**. The browser keeps
  it for that server, so you sign in once.

Treat a token like a password: anyone holding one can read and change
everything in your library.

Your tokens belong to this server, not to your data: resetting the workspace keeps them,
restoring a backup keeps the ones the server has now, and a backup file never contains them.

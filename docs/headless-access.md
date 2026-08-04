# Headless access

JustWrite's server can run on its own, without the desktop window. Point a
browser at it and you get the full app — same projects, same AI, no desktop
install on that machine.

That's useful when you want to write from a laptop or tablet while your books
and your local AI models stay on one machine, or when you keep the app running
on a home server and just open a tab.

## Opening JustWrite in a browser

Under **Settings → General**, the **Headless access** card shows the address the
server is hosting the app at, with a **Copy** button. Paste it into any browser
on the same machine and JustWrite loads.

By default that's `http://127.0.0.1:17495/` — which only accepts connections
from the machine it's running on. To reach it from another device, see
*Running the server yourself* below.

## Running the server yourself

You don't have to open the desktop app at all. The server program lives next to
JustWrite in the install folder and is called **`justwrite-server`**. Run:

```
justwrite-server serve
```

It starts on `127.0.0.1:17495` and prints the address to open.

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

The **API access** card, also under **Settings → General**, controls who may
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

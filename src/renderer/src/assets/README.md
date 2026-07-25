# Splash assets

`splash-plate.source.png` — the ORIGINAL, lossless artwork as delivered (1400x752). Kept in the
repo deliberately: it is the master. It is NOT imported by any code, so Vite never bundles it
and it costs nothing at runtime.

`splash-plate.jpg` — what the app actually ships (re-encoded from the source, ~275 KB vs
~2.2 MB). Regenerate it from the source with:

    ffmpeg -y -i splash-plate.source.png -q:v 3 splash-plate.jpg

Every word on the plate — the four corner panels, the wordmark, the calligraphy, the privacy
line — is part of the ARTWORK, not HTML. That is safe because none of it was ever live: the
corners were frozen to sample text by the 2026-07-22 ruling. If you ever want the splash to
show the real book title or word counts, a text-free plate is needed and the type goes back as
an HTML layer (see plan doc 2026-07-20 sections 30-31 for what that took).

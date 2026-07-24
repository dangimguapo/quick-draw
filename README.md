# Quick Draw — playable prototype

A dependency-free, landscape-first prototype of the two-second combat loop from
the supplied wireframes.

## Run it

From this folder:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Included in this slice

- Duel and three-player layouts against robots
- Easy, medium, and hard robot behavior
- Six-slot character-selection screen with finished art for Sir Blocksalot and
  Chuck Reloadington
- Three-second ready countdown before every match and rematch
- One-second decision and one-second reveal/outcome cadence
- Block, reload, targeted fire, and a once-per-round Double Shield power
- Visible hearts, private rival ammunition, eliminations, and victory/rematch
- Landscape and safe-area-aware mobile layout

Unique special powers are still concepts; prototype matches currently use
Double Shield for every fighter. Online accounts, matchmaking, audio, and the
remaining four final character illustrations are not part of this slice.

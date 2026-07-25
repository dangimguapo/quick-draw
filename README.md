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
- Six playable fighters with a complete 8-bit NES character roster
- Three-second ready countdown before every match and rematch
- One-second decision and one-second reveal/outcome cadence
- Block, reload, targeted fire, and six unique once-per-round powers
- Visible hearts, private rival ammunition, eliminations, and victory/rematch
- Landscape and safe-area-aware mobile layout

Double Shield, Fast Hands, Peek, Bounce, Patch Up, and Jam are playable. Online
accounts, matchmaking, and audio are not part of this slice.

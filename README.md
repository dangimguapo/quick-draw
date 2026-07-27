# Quick Draw

A dependency-free, landscape-first prototype of the two-second combat loop from
the supplied wireframes. The browser game is served locally by a Cloudflare
Worker, with a Durable Object available for multiplayer game rooms.

## Local development

From this folder:

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:8787](http://127.0.0.1:8787).

Wrangler serves the current static game and persists local Durable Object data
under `.wrangler/`. The development data stays on this computer and is not
connected to a deployed Cloudflare account.

Useful checks:

```bash
npm run check
npm run smoke
```

Run `npm run smoke` while the development server is running. It checks the
Worker health endpoint, creates a room, connects two players over WebSocket,
rejects duplicate fighter claims, and confirms that ready state is synchronized
by the Durable Object.

### Local multiplayer endpoints

- `GET /api/health` checks the Worker.
- `POST /api/rooms` creates a six-character room.
- `GET /api/rooms/:code` reads the room state.
- `GET /ws/rooms/:code?name=Player` opens the room WebSocket.

Online Mode on the setup screen now creates and joins two- or three-player
rooms. Player names, fighter choices, host status, open slots, and ready state
are synchronized in the fighter-select lobby. The next implementation step is
to make the Durable Object authoritative for countdowns, actions, and battle
results.

## Included in this slice

- Duel and three-player layouts against robots
- Easy, medium, and hard robot behavior
- Six playable western gunslingers
- Three-second ready countdown before every match and rematch
- Two-second decision and two-second outcome cadence
- Block, reload, targeted fire, and seven unique character powers
- Visible hearts, private rival ammunition, eliminations, and victory/rematch
- Landscape and safe-area-aware mobile layout

Quickdraw, Harden, 6 in the Chamber, Mirror, Time Freeze, Maniac, and the
Civilian’s repeatable Survive objective are playable. Online accounts,
matchmaking, and audio are not part of this slice.

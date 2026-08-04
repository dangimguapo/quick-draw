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

The browser and Durable Object import the same rules from
`public/src/engine.mjs`, keeping fighter validation and combat resolution in one
server-compatible source of truth.

Multiplayer WebSocket traffic uses the versioned schemas and validators in
`public/src/multiplayer-protocol.mjs`. A ready five-player lobby starts
automatically, while the host can start a ready two-to-four-player lobby.
Either path creates an authoritative Durable Object match with a persisted
countdown, decision and outcome loop. The server accepts private actions,
resolves beats through the shared engine, and sends a player-specific snapshot
that never includes rival ammunition.
See `docs/multiplayer-protocol.md` for the payloads, privacy rules, and match
lifecycle.

Useful checks:

```bash
npm run check
npm run smoke
```

Run `npm run smoke` while the development server is running. It checks the
Worker health endpoint, creates an up-to-five room, connects two players over
WebSocket, selects the same fighter for both players, rejects a non-host start,
and confirms the host can launch once both are ready. It also verifies protocol
negotiation, ping/pong, authoritative countdown and phase alarms, action
acknowledgement, beat resolution, state synchronization, duplicate Time Freeze
powers, and private-ammunition filtering.

### Local multiplayer endpoints

- `GET /api/health` checks the Worker.
- `POST /api/rooms` creates a six-character room.
- `GET /api/rooms/:code` reads the room state.
- `GET /ws/rooms/:code?name=Player` opens the room WebSocket.

Online Mode now creates a single room type for two to five players. Player
names, fighter choices, host status, open slots, and ready state are
synchronized in the fighter-select lobby. A full five-player room starts when
everyone is ready; with two to four players, the host can start once every
connected player is ready. Fighter choices are not exclusive,
so every player in a room may choose the same character and use that character’s
power in the same match. The Durable Object now owns match timing and ordinary
battle actions, and the existing duel screen now renders those server phases
and outcomes. Online controls submit private choices, highlight accepted
actions, follow the server-adjusted clock, and restore player-safe match state
after reconnecting or returning to the tab. All ten character powers are
server-authoritative online; every Time Freeze user privately receives locked
rival actions before the shared four-second response window. Online rematches
keep the same room and players; once every player votes, the Worker returns
everyone to fighter selection. Players may keep or change fighters, and the
next fresh synchronized countdown starts after everyone readies up and either
all five slots fill or the host starts early. Health, ammunition, powers, and
Civilian progress reset for the new match.

## Included in this slice

- Arcade matches against one to four selectable AI rivals
- Easy, medium, and hard robot behavior
- Ten playable western fighters
- Three-second ready countdown before every match and rematch
- Two-second decision and two-second outcome cadence
- Block, reload, targeted fire, and ten unique character powers
- Spatial outcome reenactments with action poses and attacker-to-target trails
- Visible hearts, private rival ammunition, eliminations, and victory/rematch
- Landscape and safe-area-aware mobile layout

Quickdraw, The Bulk’s Harden, 6 in the Chamber, Mirror, Time Freeze, Maniac,
the Civilian’s repeatable Survive objective, Arsonist’s Douse, Sticky Fingers,
and Circus Freak’s Jumble are playable. Online accounts, matchmaking, and audio
are not part of this slice.

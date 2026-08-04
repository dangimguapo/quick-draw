# Quick Draw multiplayer protocol

Protocol version: `1`

All WebSocket messages are JSON objects with this envelope:

```json
{
  "protocolVersion": 1,
  "type": "message_type"
}
```

Clients include `protocolVersion=1` in the WebSocket connection query. A
different or missing version is rejected before the socket joins the room.
Messages are limited to 4096 encoded bytes.

## Client messages

| Type | Required payload | Purpose |
| --- | --- | --- |
| `ping` | Optional `requestId` | Measure connectivity and server time |
| `player_update` | `name`, `characterId` | Update the lobby fighter choice |
| `ready` | `ready` boolean | Toggle lobby readiness |
| `start_match` | None | Let the host start with two to four ready players |
| `action_submit` | `matchId`, positive `beat`, `action` | Submit one private action for the current beat |
| `sync_request` | Optional `matchId` | Request the current player-safe state |
| `rematch_vote` | `vote` boolean | Accept or withdraw a rematch vote |

An action contains `type` and, when required, `targetId`. Valid action types are
`block`, `reload`, `fire`, `power`, and `wait`. Fire always requires a target.
The server will validate ammunition, power availability, living targets, match
ID, beat number, and deadline. All ten special powers are resolved by the
authoritative match, including targeted powers and the Civilian’s repeatable
survival objective.

Jumble keeps the target’s submitted choice private, then independently maps
each of the Block, Reload, and Fire buttons to any of those three actions when
the beat resolves. Duplicate outcomes are allowed, including all three buttons
becoming the same action. If the chosen button becomes Fire, the server randomly
selects another living player as its target. Special-power actions are not
scrambled.

## Server messages

| Type | Required payload | Purpose |
| --- | --- | --- |
| `pong` | `serverTime`, optional `requestId` | Reply to a ping |
| `error` | `code`, `message` | Reject invalid or out-of-state input |
| `room_state` | `room` | Synchronize the lobby |
| `match_start` | `matchId`, `state` | Initialize fighters and countdown |
| `phase_started` | `matchId`, `phase`, `beat`, `deadlineAt` | Start a server-timed phase |
| `action_accepted` | `matchId`, `beat`, `action` | Confirm only the submitting player’s locked choice |
| `beat_result` | `matchId`, `beat`, `result` | Reveal the resolved public outcome |
| `match_end` | `matchId`, `result` | Announce the winner and final state |
| `state_sync` | `state` | Restore the correct lobby or match view |

Phases are `lobby`, `countdown`, `decide`, `freeze`, `outcome`, and `gameover`.
`deadlineAt` is an absolute Unix timestamp in milliseconds supplied by the
Durable Object.

## Player-safe state

Online state is sent separately to each socket. A match snapshot will contain:

- `matchId`, phase, beat, and deadline;
- player IDs, names, fighter IDs, hearts, alive state, used powers, and public Douse status;
- the receiving player’s ammunition;
- no rival ammunition;
- the receiving player’s accepted selection, when one exists;
- no rival selections before the reveal deadline.

`beat_result` may reveal every normalized action, public event, damage,
elimination, and victory result after the deadline. It must not reveal remaining
rival ammunition. For Sticky Fingers, only the thief and victim receive the
exact number of bullets transferred; other players see the theft without its
private amount.

Time Freeze is the one exception to pre-outcome action privacy. When its
original decision window closes, the match enters `freeze` for four seconds.
Every player who selected Time Freeze on that beat receives their own private
`revealedActions` and may choose a response during the same four-second window.
Players who did not use Time Freeze receive their own locked selection and the
identities of the players choosing responses, but no rival actions or
ammunition.

## Lifecycle

1. Clients join and exchange `room_state` messages.
2. Every room holds up to five players and requires at least two. A full,
   ready five-player room starts automatically. With two to four connected
   players, the host sends `start_match` after everyone in the room is ready.
3. The server broadcasts `phase_started` for countdown and decision phases.
4. Each living player sends at most one current-beat `action_submit`; later
   submissions replace their earlier selection until the deadline.
5. The server resolves missing actions as `wait`. If one or more Time Freeze
   powers were selected, rivals are locked and each Time Freeze user receives
   private rival actions during a shared four-second response window.
6. The server broadcasts `beat_result`, followed by the next `phase_started` or
   `match_end`.
7. A reconnecting client sends `sync_request` and receives its private
   `state_sync`.
8. After game over, players send `rematch_vote`. Room state includes the vote
   count and voter IDs. Once every original player is connected and has voted,
   the server clears the finished match and returns everyone, unready, to
   fighter selection in the same room. Players may change fighters. When
   everyone is ready again, either all five slots filling or a host
   `start_match` creates a fresh match and broadcasts `match_start`.

The Durable Object is authoritative for every online deadline and outcome.
Browsers render server messages and never resolve an online beat independently.
The current server cadence is a three-second opening countdown, a two-second
decision window, an optional four-second Time Freeze response, and a two-second
public outcome window. Durable Object alarms advance those phases even when no
browser sends another message. Match state, including private ammunition,
accepted choices, used powers, Douse timers, and Civilian progress, is saved in Durable
Object storage between events.

A rematch preserves the room and player identities while returning the group
to fighter selection. Existing fighter choices remain selected as defaults,
but every player may choose a different fighter before readying up. The next
match resets the match ID, countdown, health, ammunition, once-per-match
powers, and Civilian survival progress. A player may send `vote: false` to
withdraw their vote before everyone has agreed.

The browser estimates its offset from server time with `ping`/`pong`, then
renders `deadlineAt` against that adjusted clock. Changing or hiding a browser
tab does not pause an online match. On return, the client requests `state_sync`
and rebuilds the duel screen from the player-safe snapshot.

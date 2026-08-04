import assert from "node:assert/strict";
import { ACTIONS } from "../public/src/engine.mjs";
import {
  CLIENT_MESSAGE_TYPES,
  MATCH_PHASES,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  createClientMessage,
  createServerMessage,
  parseClientMessage,
  parseServerMessage
} from "../public/src/multiplayer-protocol.mjs";

const ready = createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true });
assert.equal(ready.protocolVersion, PROTOCOL_VERSION);
assert.equal(parseClientMessage(JSON.stringify(ready)).ok, true);

const startMatch = createClientMessage(CLIENT_MESSAGE_TYPES.START_MATCH);
assert.equal(parseClientMessage(JSON.stringify(startMatch)).ok, true);

const rematchVote = createClientMessage(CLIENT_MESSAGE_TYPES.REMATCH_VOTE, {
  vote: true
});
assert.equal(parseClientMessage(JSON.stringify(rematchVote)).value.vote, true);

const fire = createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
  matchId: "match-1",
  beat: 2,
  action: { type: ACTIONS.FIRE, targetId: "player-2" }
});
assert.equal(parseClientMessage(JSON.stringify(fire)).value.action.targetId, "player-2");

const untargetedFire = parseClientMessage(
  JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    type: CLIENT_MESSAGE_TYPES.ACTION_SUBMIT,
    matchId: "match-1",
    beat: 2,
    action: { type: ACTIONS.FIRE }
  })
);
assert.equal(untargetedFire.ok, false);
assert.equal(untargetedFire.error.code, "missing_target");

const oldClient = parseClientMessage(
  JSON.stringify({
    protocolVersion: PROTOCOL_VERSION - 1,
    type: CLIENT_MESSAGE_TYPES.READY,
    ready: true
  })
);
assert.equal(oldClient.ok, false);
assert.equal(oldClient.error.code, "protocol_mismatch");

const oversized = parseClientMessage("x".repeat(MAX_MESSAGE_BYTES + 1));
assert.equal(oversized.ok, false);
assert.equal(oversized.error.code, "message_too_large");

const phase = createServerMessage(SERVER_MESSAGE_TYPES.PHASE_STARTED, {
  matchId: "match-1",
  phase: MATCH_PHASES.DECIDE,
  beat: 1,
  deadlineAt: Date.now() + 2000
});
assert.equal(parseServerMessage(JSON.stringify(phase)).ok, true);

const error = createServerMessage(SERVER_MESSAGE_TYPES.ERROR, {
  code: "invalid_action",
  message: "That action is not available."
});
assert.equal(parseServerMessage(JSON.stringify(error)).value.code, "invalid_action");

console.log("Versioned multiplayer protocol validation passed.");

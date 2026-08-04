import { ACTIONS, isCharacterId } from "./engine.mjs";

const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 4096;

const CLIENT_MESSAGE_TYPES = Object.freeze({
  PING: "ping",
  PLAYER_UPDATE: "player_update",
  READY: "ready",
  START_MATCH: "start_match",
  ACTION_SUBMIT: "action_submit",
  SYNC_REQUEST: "sync_request",
  REMATCH_VOTE: "rematch_vote",
});

const SERVER_MESSAGE_TYPES = Object.freeze({
  PONG: "pong",
  ERROR: "error",
  ROOM_STATE: "room_state",
  MATCH_START: "match_start",
  PHASE_STARTED: "phase_started",
  ACTION_ACCEPTED: "action_accepted",
  BEAT_RESULT: "beat_result",
  MATCH_END: "match_end",
  STATE_SYNC: "state_sync",
});

const MATCH_PHASES = Object.freeze({
  LOBBY: "lobby",
  COUNTDOWN: "countdown",
  DECIDE: "decide",
  FREEZE: "freeze",
  OUTCOME: "outcome",
  GAMEOVER: "gameover",
});

const CLIENT_TYPES = new Set(Object.values(CLIENT_MESSAGE_TYPES));
const SERVER_TYPES = new Set(Object.values(SERVER_MESSAGE_TYPES));
const ACTION_TYPES = new Set(Object.values(ACTIONS));
const MATCH_PHASE_VALUES = new Set(Object.values(MATCH_PHASES));

function createClientMessage(type, payload = {}) {
  return validatedMessage(
    validateClientMessage({ protocolVersion: PROTOCOL_VERSION, type, ...payload }),
  );
}

function createServerMessage(type, payload = {}) {
  return validatedMessage(
    validateServerMessage({ protocolVersion: PROTOCOL_VERSION, type, ...payload }),
  );
}

function parseClientMessage(raw) {
  const decoded = decodeMessage(raw);
  return decoded.ok ? validateClientMessage(decoded.value) : decoded;
}

function parseServerMessage(raw) {
  const decoded = decodeMessage(raw);
  return decoded.ok ? validateServerMessage(decoded.value) : decoded;
}

function validateClientMessage(message) {
  const envelope = validateEnvelope(message, CLIENT_TYPES);
  if (!envelope.ok) return envelope;

  if (message.type === CLIENT_MESSAGE_TYPES.PING) {
    if (message.requestId !== undefined && !isShortString(message.requestId, 64)) {
      return failure("invalid_request_id", "Ping requestId must be 64 characters or fewer.");
    }
  }

  if (message.type === CLIENT_MESSAGE_TYPES.PLAYER_UPDATE) {
    if (!isShortString(message.name, 24)) {
      return failure("invalid_player_name", "Player name must be between 1 and 24 characters.");
    }
    if (!isCharacterId(message.characterId)) {
      return failure("invalid_character", "Unknown fighter.");
    }
  }

  if (
    message.type === CLIENT_MESSAGE_TYPES.READY &&
    typeof message.ready !== "boolean"
  ) {
    return failure("invalid_ready_state", "Ready state must be true or false.");
  }

  if (message.type === CLIENT_MESSAGE_TYPES.ACTION_SUBMIT) {
    if (!isIdentifier(message.matchId)) {
      return failure("invalid_match_id", "Action submissions require a match ID.");
    }
    if (!Number.isInteger(message.beat) || message.beat < 1) {
      return failure("invalid_beat", "Action submissions require a positive beat number.");
    }
    const action = validateAction(message.action);
    if (!action.ok) return action;
  }

  if (
    message.type === CLIENT_MESSAGE_TYPES.SYNC_REQUEST &&
    message.matchId !== undefined &&
    !isIdentifier(message.matchId)
  ) {
    return failure("invalid_match_id", "Sync requests require a valid match ID.");
  }

  if (
    message.type === CLIENT_MESSAGE_TYPES.REMATCH_VOTE &&
    typeof message.vote !== "boolean"
  ) {
    return failure("invalid_rematch_vote", "Rematch vote must be true or false.");
  }

  return success({ ...message });
}

function validateServerMessage(message) {
  const envelope = validateEnvelope(message, SERVER_TYPES);
  if (!envelope.ok) return envelope;

  if (
    message.type === SERVER_MESSAGE_TYPES.ERROR &&
    (!isShortString(message.code, 64) || !isShortString(message.message, 240))
  ) {
    return failure("invalid_error", "Server errors require a code and message.");
  }

  if (
    message.type === SERVER_MESSAGE_TYPES.ROOM_STATE &&
    !isRecord(message.room)
  ) {
    return failure("invalid_room_state", "Room state requires a room object.");
  }

  if (message.type === SERVER_MESSAGE_TYPES.MATCH_START) {
    if (!isIdentifier(message.matchId) || !isRecord(message.state)) {
      return failure("invalid_match_start", "Match start requires an ID and state.");
    }
  }

  if (message.type === SERVER_MESSAGE_TYPES.PHASE_STARTED) {
    if (
      !isIdentifier(message.matchId) ||
      !MATCH_PHASE_VALUES.has(message.phase) ||
      !Number.isInteger(message.beat) ||
      message.beat < 0 ||
      !Number.isFinite(message.deadlineAt)
    ) {
      return failure("invalid_phase", "Phase messages require a match, beat, phase, and deadline.");
    }
  }

  if (message.type === SERVER_MESSAGE_TYPES.ACTION_ACCEPTED) {
    if (
      !isIdentifier(message.matchId) ||
      !Number.isInteger(message.beat) ||
      message.beat < 1 ||
      !validateAction(message.action).ok
    ) {
      return failure("invalid_action_ack", "Action acknowledgement is invalid.");
    }
  }

  if (message.type === SERVER_MESSAGE_TYPES.BEAT_RESULT) {
    if (
      !isIdentifier(message.matchId) ||
      !Number.isInteger(message.beat) ||
      message.beat < 1 ||
      !isRecord(message.result)
    ) {
      return failure("invalid_beat_result", "Beat result requires a match, beat, and result.");
    }
  }

  if (message.type === SERVER_MESSAGE_TYPES.MATCH_END) {
    if (!isIdentifier(message.matchId) || !isRecord(message.result)) {
      return failure("invalid_match_end", "Match end requires a match ID and result.");
    }
  }

  if (
    message.type === SERVER_MESSAGE_TYPES.STATE_SYNC &&
    !isRecord(message.state)
  ) {
    return failure("invalid_state_sync", "State sync requires a state object.");
  }

  return success({ ...message });
}

function validateAction(action) {
  if (!isRecord(action) || !ACTION_TYPES.has(action.type)) {
    return failure("invalid_action", "Unknown action.");
  }

  if (
    action.targetId !== undefined &&
    action.targetId !== null &&
    !isIdentifier(action.targetId)
  ) {
    return failure("invalid_target", "Action target is invalid.");
  }

  if (action.type === ACTIONS.FIRE && !isIdentifier(action.targetId)) {
    return failure("missing_target", "Fire requires a target.");
  }

  return success({
    type: action.type,
    ...(action.targetId ? { targetId: action.targetId } : {}),
  });
}

function validateEnvelope(message, allowedTypes) {
  if (!isRecord(message)) {
    return failure("invalid_message", "Message must be a JSON object.");
  }
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    return failure(
      "protocol_mismatch",
      `Expected multiplayer protocol version ${PROTOCOL_VERSION}.`,
    );
  }
  if (!allowedTypes.has(message.type)) {
    return failure("unsupported_message", "Unsupported message type.");
  }
  return success(message);
}

function decodeMessage(raw) {
  if (isRecord(raw)) return success(raw);
  if (typeof raw !== "string") {
    return failure("invalid_message", "Message must be JSON text.");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
    return failure("message_too_large", "Message exceeds the 4096-byte limit.");
  }
  try {
    return success(JSON.parse(raw));
  } catch {
    return failure("invalid_json", "Message contains invalid JSON.");
  }
}

function validatedMessage(result) {
  if (!result.ok) {
    throw new TypeError(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value) {
  return isShortString(value, 64) && /^[A-Za-z0-9_-]+$/.test(value);
}

function isShortString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function success(value) {
  return { ok: true, value };
}

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

export {
  CLIENT_MESSAGE_TYPES,
  MATCH_PHASES,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  createClientMessage,
  createServerMessage,
  parseClientMessage,
  parseServerMessage,
  validateAction,
};

import { DurableObject } from "cloudflare:workers";
import {
  ACTIONS,
  POWER_IDS,
  canUsePower,
  createFighter,
  isCharacterId,
  powerIdFor,
  resolveTurn,
} from "../public/src/engine.mjs";
import {
  CLIENT_MESSAGE_TYPES,
  MATCH_PHASES,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  createServerMessage,
  parseClientMessage,
} from "../public/src/multiplayer-protocol.mjs";
import { validateMatchAction } from "./match-actions.mjs";
import { playerSafeBeatResult } from "./player-safe-result.mjs";

const ROOM_STORAGE_KEY = "room";
const MATCH_STORAGE_KEY = "match";
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const COUNTDOWN_MS = 3000;
const DECIDE_MS = 2000;
const FREEZE_MS = 4000;
const OUTCOME_MS = 2000;
const ROOM_CLOSED_CODE = 4004;
const ROOM_CLOSED_REASON = "Host left; room closed.";

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.cachedRoom = undefined;
    this.cachedMatch = undefined;
    this.roomClosing = false;
    this.ephemeralMode = false;
    this.ephemeralDeadlineTimer = null;
    this.residencyTimer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const roomCode = request.headers.get("x-quick-draw-room");

    if (request.method === "POST" && url.pathname === "/initialize") {
      const existing = await this.readRoom();
      if (!existing) {
        this.roomClosing = false;
        await this.writeRoom({
          code: roomCode,
          createdAt: new Date().toISOString(),
          maxPlayers: MAX_PLAYERS,
          hostPlayerId: null,
          activeMatchId: null,
          protocolVersion: PROTOCOL_VERSION,
        });
      }

      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const [room, match] = await Promise.all([
        this.readRoom(),
        this.readMatch(),
      ]);
      if (!room) {
        return json({ error: "Room not found" }, { status: 404 });
      }
      return json(this.roomState(room, match));
    }

    if (request.method === "GET" && url.pathname === "/connect") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return json(
          { error: "Expected a WebSocket upgrade request." },
          { status: 426 },
        );
      }

      const room = await this.readRoom();
      if (!room) {
        return json({ error: "Room not found" }, { status: 404 });
      }
      if (Number(url.searchParams.get("protocolVersion")) !== PROTOCOL_VERSION) {
        return json(
          {
            error: `Multiplayer protocol version ${PROTOCOL_VERSION} is required.`,
            protocolVersion: PROTOCOL_VERSION,
          },
          { status: 409 },
        );
      }

      const playerId = url.searchParams.get("playerId") || crypto.randomUUID();
      const match = await this.readMatch();
      if (
        isActiveMatch(match) &&
        !match.fighters.some((fighter) => fighter.id === playerId)
      ) {
        return json(
          { error: "A match is already in progress." },
          { status: 409 },
        );
      }
      if (
        match?.phase === MATCH_PHASES.GAMEOVER &&
        !match.fighters.some((fighter) => fighter.id === playerId)
      ) {
        return json(
          { error: "This room is waiting for its players to choose a rematch." },
          { status: 409 },
        );
      }

      const currentSockets = this.ctx.getWebSockets();
      const replacedSocket = currentSockets.find(
        (socket) => socket.deserializeAttachment()?.id === playerId,
      );
      const replacedPlayer = replacedSocket?.deserializeAttachment();
      const activePlayers = currentSockets.filter(
        (socket) => socket !== replacedSocket,
      );
      if (!isActiveMatch(match) && activePlayers.length >= room.maxPlayers) {
        return json({ error: "Room is full" }, { status: 409 });
      }

      const matchFighter = match?.fighters.find(
        (fighter) => fighter.id === playerId,
      );
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const player = replacedPlayer ?? {
        id: playerId,
        name: matchFighter?.name ?? cleanPlayerName(url.searchParams.get("name")),
        characterId: matchFighter?.characterId ?? null,
        ready: isActiveMatch(match) && Boolean(matchFighter),
        protocolVersion: PROTOCOL_VERSION,
        connectedAt: new Date().toISOString(),
      };

      if (!room.hostPlayerId) {
        room.hostPlayerId = player.id;
        await this.writeRoom(room);
      }

      this.ctx.acceptWebSocket(server);
      this.keepEphemeralRoomResident();
      server.serializeAttachment(player);
      replacedSocket?.close(4001, "Reconnected from another tab");
      this.broadcastRoomState(room, match);

      if (match) {
        this.sendStateSync(server, room, match);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "Not found" }, { status: 404 });
  }

  async webSocketMessage(socket, message) {
    this.keepEphemeralRoomResident();
    const player = socket.deserializeAttachment();
    const parsed = parseClientMessage(message);
    if (!parsed.ok) {
      sendProtocolError(socket, parsed.error.code, parsed.error.message);
      return;
    }
    const event = parsed.value;

    if (event.type === CLIENT_MESSAGE_TYPES.PING) {
      sendServerMessage(socket, SERVER_MESSAGE_TYPES.PONG, {
        ...(event.requestId ? { requestId: event.requestId } : {}),
        serverTime: Date.now(),
      });
      return;
    }

    if (event.type === CLIENT_MESSAGE_TYPES.SYNC_REQUEST) {
      const [room, match] = await Promise.all([
        this.readRoom(),
        this.readMatch(),
      ]);
      this.sendStateSync(socket, room, match);
      return;
    }

    if (event.type === CLIENT_MESSAGE_TYPES.ACTION_SUBMIT) {
      await this.acceptAction(socket, player, event);
      return;
    }

    if (event.type === CLIENT_MESSAGE_TYPES.REMATCH_VOTE) {
      await this.acceptRematchVote(socket, player, event);
      return;
    }

    if (event.type === CLIENT_MESSAGE_TYPES.START_MATCH) {
      await this.acceptHostStart(socket, player);
      return;
    }

    const match = await this.readMatch();
    if (isActiveMatch(match)) {
      sendProtocolError(
        socket,
        "match_in_progress",
        "Fighter and ready settings are locked during a match.",
      );
      return;
    }
    if (match?.phase === MATCH_PHASES.GAMEOVER) {
      sendProtocolError(
        socket,
        "rematch_vote_required",
        "Use the rematch button to start another duel with this room.",
      );
      return;
    }

    if (event.type === CLIENT_MESSAGE_TYPES.READY) {
      if (!player.characterId) {
        sendProtocolError(
          socket,
          "fighter_required",
          "Choose a fighter before getting ready.",
        );
        return;
      }

      player.ready = Boolean(event.ready);
      socket.serializeAttachment(player);
      const room = await this.readRoom();
      this.broadcastRoomState(room);
      if (player.ready) await this.startMatchIfReady(room);
      return;
    }

    if (event.type === CLIENT_MESSAGE_TYPES.PLAYER_UPDATE) {
      const characterId = cleanCharacterId(event.characterId);
      if (!characterId) {
        sendProtocolError(
          socket,
          "invalid_character",
          "Unknown fighter.",
        );
        return;
      }

      player.characterId = characterId;
      player.name = cleanPlayerName(event.name || player.name);
      player.ready = false;
      socket.serializeAttachment(player);
      const room = await this.readRoom();
      this.broadcastRoomState(room);
      return;
    }

    sendProtocolError(socket, "unsupported_message", "Unsupported message type.");
  }

  async alarm() {
    if (this.roomClosing) return;

    const room = await this.readRoom();
    if (!room) {
      await this.cancelPersistentAlarm();
      return;
    }
    if (!this.isPlayerConnected(room.hostPlayerId)) {
      await this.closeRoom();
      return;
    }

    const match = await this.readMatch();
    if (!isActiveMatch(match)) return;

    const now = Date.now();
    if (match.deadlineAt > now) {
      await this.scheduleDeadline(match.deadlineAt);
      return;
    }

    if (match.phase === MATCH_PHASES.COUNTDOWN) {
      await this.beginDecision(match);
      return;
    }

    if (match.phase === MATCH_PHASES.DECIDE) {
      await this.closeDecision(match);
      return;
    }

    if (match.phase === MATCH_PHASES.FREEZE) {
      await this.resolveBeat(match);
      return;
    }

    if (match.phase === MATCH_PHASES.OUTCOME) {
      if (match.pendingEnd) {
        await this.endMatch(match);
      } else {
        await this.beginDecision(match);
      }
    }
  }

  async webSocketClose(socket) {
    const departedPlayer = socket.deserializeAttachment();
    await this.handleSocketDeparture(socket, departedPlayer);
  }

  async webSocketError(socket) {
    const departedPlayer = socket.deserializeAttachment();
    await this.handleSocketDeparture(socket, departedPlayer);
  }

  async startMatchIfReady(room) {
    if (!room) return;
    const existingMatch = await this.readMatch();
    if (existingMatch) return;

    const players = this.connectedPlayers();
    const canStart =
      players.length === room.maxPlayers &&
      players.every((player) => player.ready && player.characterId);
    if (!canStart) return;

    await this.startMatch(room, players);
  }

  async acceptHostStart(socket, player) {
    const [room, match] = await Promise.all([
      this.readRoom(),
      this.readMatch(),
    ]);
    if (!room || match) {
      sendProtocolError(
        socket,
        "match_unavailable",
        "This room cannot start another match right now.",
      );
      return;
    }
    if (player?.id !== room.hostPlayerId) {
      sendProtocolError(
        socket,
        "host_only",
        "Only the room host can start before all five slots are filled.",
      );
      return;
    }

    const players = this.connectedPlayers();
    if (players.length < MIN_PLAYERS) {
      sendProtocolError(
        socket,
        "minimum_players",
        "At least two players are required to start.",
      );
      return;
    }
    if (players.some((candidate) => !candidate.ready || !candidate.characterId)) {
      sendProtocolError(
        socket,
        "players_not_ready",
        "Every player currently in the room must choose a fighter and ready up.",
      );
      return;
    }

    await this.startMatch(room, players);
  }

  async startMatch(room, players) {
    const match = {
      id: crypto.randomUUID(),
      phase: MATCH_PHASES.COUNTDOWN,
      beat: 0,
      deadlineAt: Date.now() + COUNTDOWN_MS,
      fighters: players.map((player) =>
        createFighter({
          id: player.id,
          name: player.name,
          isHuman: true,
          characterId: player.characterId,
        }),
      ),
      selections: {},
      freezePlayerIds: [],
      frozenSelections: null,
      lastResult: null,
      pendingEnd: null,
      rematchVotes: [],
      createdAt: new Date().toISOString(),
    };

    room.activeMatchId = match.id;
    await Promise.all([this.writeRoom(room), this.writeMatch(match)]);
    await this.scheduleDeadline(match.deadlineAt);

    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment();
      sendServerMessage(socket, SERVER_MESSAGE_TYPES.MATCH_START, {
        matchId: match.id,
        state: playerSafeMatchState(match, player?.id, {
          includeLastResult: false,
        }),
      });
    }
    this.broadcastPhase(match);
    this.broadcastRoomState(room, match);
  }

  async acceptRematchVote(socket, player, event) {
    const [room, match] = await Promise.all([
      this.readRoom(),
      this.readMatch(),
    ]);
    if (!room || match?.phase !== MATCH_PHASES.GAMEOVER) {
      sendProtocolError(
        socket,
        "rematch_not_available",
        "A rematch vote is only available after the duel ends.",
      );
      return;
    }

    const participantIds = match.fighters.map((fighter) => fighter.id);
    if (!participantIds.includes(player?.id)) {
      sendProtocolError(
        socket,
        "rematch_not_available",
        "Only players from the finished match can vote for a rematch.",
      );
      return;
    }

    const votes = new Set(match.rematchVotes ?? []);
    if (event.vote) {
      votes.add(player.id);
    } else {
      votes.delete(player.id);
    }
    match.rematchVotes = participantIds.filter((playerId) => votes.has(playerId));
    await this.writeMatch(match);
    this.broadcastRoomState(room, match);

    const connectedById = new Map(
      this.connectedPlayers().map((candidate) => [candidate.id, candidate]),
    );
    const allPlayersPresent = participantIds.every((playerId) =>
      connectedById.has(playerId),
    );
    const allPlayersVoted = participantIds.every((playerId) =>
      votes.has(playerId),
    );
    if (!allPlayersPresent || !allPlayersVoted) return;

    await this.returnToCharacterSelect(room);
  }

  async returnToCharacterSelect(room) {
    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment();
      if (!player) continue;
      player.ready = false;
      socket.serializeAttachment(player);
    }

    room.activeMatchId = null;
    await this.writeRoom(room);
    await this.clearMatch();
    this.broadcastRoomState(room);
  }

  async acceptAction(socket, player, event) {
    const match = await this.readMatch();
    if (!isActiveMatch(match)) {
      sendProtocolError(
        socket,
        "match_not_started",
        "The room has not started an online match yet.",
      );
      return;
    }
    if (event.matchId !== match.id) {
      sendProtocolError(socket, "stale_match", "That action is for an old match.");
      return;
    }
    const isDecision = match.phase === MATCH_PHASES.DECIDE;
    const freezePlayerIds =
      match.freezePlayerIds ??
      (match.freezePlayerId ? [match.freezePlayerId] : []);
    const isFreezeChoice =
      match.phase === MATCH_PHASES.FREEZE &&
      freezePlayerIds.includes(player?.id);
    if ((!isDecision && !isFreezeChoice) || Date.now() >= match.deadlineAt) {
      sendProtocolError(
        socket,
        "decision_closed",
        "The decision window for this beat is closed.",
      );
      return;
    }
    if (event.beat !== match.beat) {
      sendProtocolError(
        socket,
        "stale_beat",
        "That action is not for the current beat.",
      );
      return;
    }

    const fighter = match.fighters.find(
      (candidate) => candidate.id === player?.id,
    );
    if (!fighter?.alive) {
      sendProtocolError(
        socket,
        "fighter_inactive",
        "An eliminated fighter cannot submit an action.",
      );
      return;
    }

    const accepted = validateMatchAction(
      fighter,
      match.fighters,
      event.action,
      { allowPower: isDecision },
    );
    if (!accepted.ok) {
      sendProtocolError(socket, accepted.code, accepted.message);
      return;
    }

    match.selections[player.id] = accepted.action;
    await this.writeMatch(match);
    sendServerMessage(socket, SERVER_MESSAGE_TYPES.ACTION_ACCEPTED, {
      matchId: match.id,
      beat: match.beat,
      action: accepted.action,
    });
  }

  async beginDecision(match) {
    match.phase = MATCH_PHASES.DECIDE;
    match.beat += 1;
    match.deadlineAt = Date.now() + DECIDE_MS;
    match.selections = {};
    match.freezePlayerIds = [];
    match.frozenSelections = null;
    match.pendingEnd = null;
    await this.writeMatch(match);
    await this.scheduleDeadline(match.deadlineAt);
    this.broadcastPhase(match);
  }

  async closeDecision(match) {
    const timeFreezeFighters = match.fighters.filter((fighter) => {
      const action = match.selections[fighter.id];
      return (
        fighter.alive &&
        powerIdFor(fighter) === POWER_IDS.TIME_FREEZE &&
        action?.type === ACTIONS.POWER &&
        canUsePower(fighter, match.fighters, action)
      );
    });

    if (!timeFreezeFighters.length) {
      await this.resolveBeat(match);
      return;
    }

    for (const fighter of match.fighters.filter((candidate) => candidate.alive)) {
      match.selections[fighter.id] ??= { type: ACTIONS.WAIT };
    }
    match.frozenSelections = structuredClone(match.selections);
    match.freezePlayerIds = timeFreezeFighters.map((fighter) => fighter.id);
    for (const fighter of timeFreezeFighters) {
      delete match.selections[fighter.id];
      fighter.powerUsed = true;
    }
    match.phase = MATCH_PHASES.FREEZE;
    match.deadlineAt = Date.now() + FREEZE_MS;

    await this.writeMatch(match);
    await this.scheduleDeadline(match.deadlineAt);
    this.broadcastPhase(match);
  }

  async resolveBeat(match) {
    const timeFreezePlayerIds =
      match.freezePlayerIds ??
      (match.freezePlayerId ? [match.freezePlayerId] : []);
    const selections = new Map(
      match.fighters
        .filter((fighter) => fighter.alive)
        .map((fighter) => [
          fighter.id,
          match.selections[fighter.id] ?? { type: ACTIONS.WAIT },
        ]),
    );
    const resolved = resolveTurn(match.fighters, selections);
    for (const fighterId of timeFreezePlayerIds) {
      resolved.events.unshift({
        type: "power",
        actorId: fighterId,
        targetId: null,
        powerId: POWER_IDS.TIME_FREEZE,
      });
    }
    const result = serializeBeatResult(resolved);
    match.freezePlayerIds = [];
    match.frozenSelections = null;
    match.lastResult = result;
    match.phase = MATCH_PHASES.OUTCOME;
    match.deadlineAt = Date.now() + OUTCOME_MS;
    match.pendingEnd = determineMatchEnd(match.fighters, result.events);

    await this.writeMatch(match);
    await this.scheduleDeadline(match.deadlineAt);

    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment();
      const safeResult = playerSafeBeatResult(result, player?.id);
      sendServerMessage(socket, SERVER_MESSAGE_TYPES.BEAT_RESULT, {
        matchId: match.id,
        beat: match.beat,
        result: {
          ...safeResult,
          state: playerSafeMatchState(match, player?.id, {
            includeLastResult: false,
          }),
        },
      });
    }
    this.broadcastPhase(match);
  }

  async endMatch(match) {
    match.phase = MATCH_PHASES.GAMEOVER;
    match.deadlineAt = null;
    match.rematchVotes = [];
    await this.writeMatch(match);

    const room = await this.readRoom();
    if (room) {
      room.activeMatchId = null;
      await this.writeRoom(room);
    }

    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment();
      if (player) {
        player.ready = false;
        socket.serializeAttachment(player);
      }
      sendServerMessage(socket, SERVER_MESSAGE_TYPES.MATCH_END, {
        matchId: match.id,
        result: {
          ...match.pendingEnd,
          state: playerSafeMatchState(match, player?.id, {
            includeLastResult: false,
          }),
        },
      });
    }
    this.broadcastRoomState(room, match);
  }

  async readRoom() {
    if (this.cachedRoom !== undefined) return this.cachedRoom;
    try {
      this.cachedRoom =
        (await this.ctx.storage.get(ROOM_STORAGE_KEY)) ?? null;
    } catch (error) {
      if (!isDurableQuotaError(error)) throw error;
      this.enableEphemeralMode(error);
      this.cachedRoom = null;
    }
    return this.cachedRoom;
  }

  async readMatch() {
    if (this.cachedMatch !== undefined) return this.cachedMatch;
    try {
      this.cachedMatch =
        (await this.ctx.storage.get(MATCH_STORAGE_KEY)) ?? null;
    } catch (error) {
      if (!isDurableQuotaError(error)) throw error;
      this.enableEphemeralMode(error);
      this.cachedMatch = null;
    }
    return this.cachedMatch;
  }

  async writeRoom(room) {
    this.cachedRoom = room;
    if (this.ephemeralMode) return;
    try {
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
    } catch (error) {
      if (!isDurableQuotaError(error)) throw error;
      this.enableEphemeralMode(error);
    }
  }

  async writeMatch(match) {
    this.cachedMatch = match;
    if (this.ephemeralMode) return;
    try {
      await this.ctx.storage.put(MATCH_STORAGE_KEY, match);
    } catch (error) {
      if (!isDurableQuotaError(error)) throw error;
      this.enableEphemeralMode(error);
    }
  }

  async clearMatch() {
    this.cachedMatch = null;
    if (this.ephemeralDeadlineTimer) {
      clearTimeout(this.ephemeralDeadlineTimer);
      this.ephemeralDeadlineTimer = null;
    }
    if (this.ephemeralMode) return;
    try {
      await this.ctx.storage.delete(MATCH_STORAGE_KEY);
    } catch (error) {
      if (!isDurableQuotaError(error)) throw error;
      this.enableEphemeralMode(error);
    }
  }

  async handleSocketDeparture(socket, departedPlayer) {
    if (this.roomClosing) return;

    const room = await this.readRoom();
    if (!room) {
      this.releaseEphemeralRoomIfEmpty(socket);
      return;
    }

    const hostDisconnected =
      departedPlayer?.id === room.hostPlayerId &&
      !this.isPlayerConnected(room.hostPlayerId, socket);
    if (hostDisconnected) {
      await this.closeRoom(socket);
      return;
    }

    const match = await this.readMatch();
    this.broadcastRoomState(room, match);
    this.releaseEphemeralRoomIfEmpty(socket);
  }

  async closeRoom(departedSocket = null) {
    if (this.roomClosing) return;
    this.roomClosing = true;
    this.clearEphemeralTimers();
    this.cachedRoom = null;
    this.cachedMatch = null;

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === departedSocket) continue;
      try {
        socket.close(ROOM_CLOSED_CODE, ROOM_CLOSED_REASON);
      } catch {
        // The socket may already be closing.
      }
    }

    await this.cancelPersistentAlarm();
    if (this.ephemeralMode) return;

    try {
      await this.ctx.storage.deleteAll();
    } catch (error) {
      if (!isDurableQuotaError(error)) {
        console.error("Could not delete closed room storage.", error);
      }
    }
  }

  async cancelPersistentAlarm() {
    if (this.ephemeralMode) return;
    try {
      await this.ctx.storage.deleteAlarm();
    } catch (error) {
      if (!isDurableQuotaError(error)) {
        console.error("Could not cancel closed room alarm.", error);
      }
    }
  }

  clearEphemeralTimers() {
    if (this.residencyTimer) clearTimeout(this.residencyTimer);
    if (this.ephemeralDeadlineTimer) clearTimeout(this.ephemeralDeadlineTimer);
    this.residencyTimer = null;
    this.ephemeralDeadlineTimer = null;
  }

  isPlayerConnected(playerId, excludedSocket = null) {
    if (!playerId) return false;
    return this.ctx
      .getWebSockets()
      .some(
        (socket) =>
          socket !== excludedSocket &&
          socket.deserializeAttachment()?.id === playerId,
      );
  }

  async scheduleDeadline(deadlineAt) {
    if (this.roomClosing) return;
    if (!this.ephemeralMode) {
      try {
        await this.ctx.storage.setAlarm(deadlineAt);
        return;
      } catch (error) {
        if (!isDurableQuotaError(error)) throw error;
        this.enableEphemeralMode(error);
      }
    }

    if (this.ephemeralDeadlineTimer) {
      clearTimeout(this.ephemeralDeadlineTimer);
    }
    this.keepEphemeralRoomResident();
    this.ephemeralDeadlineTimer = setTimeout(() => {
      this.ephemeralDeadlineTimer = null;
      this.alarm().catch((error) => {
        console.error("Ephemeral match timer failed", error);
      });
    }, Math.max(0, deadlineAt - Date.now()));
  }

  enableEphemeralMode(error) {
    if (this.ephemeralMode) return;
    this.ephemeralMode = true;
    console.warn(
      "Durable storage quota unavailable; keeping this room in memory.",
      error?.message ?? error,
    );
    this.keepEphemeralRoomResident();
  }

  keepEphemeralRoomResident() {
    if (!this.ephemeralMode) return;
    if (this.residencyTimer) clearTimeout(this.residencyTimer);
    this.residencyTimer = setTimeout(() => {
      this.residencyTimer = null;
      if (this.ctx.getWebSockets().length > 0) {
        this.keepEphemeralRoomResident();
      }
    }, 60_000);
  }

  releaseEphemeralRoomIfEmpty(departedSocket) {
    if (!this.ephemeralMode) return;
    const hasRemainingSocket = this.ctx
      .getWebSockets()
      .some((socket) => socket !== departedSocket);
    if (hasRemainingSocket) {
      this.keepEphemeralRoomResident();
      return;
    }
    this.clearEphemeralTimers();
    this.cachedRoom = null;
    this.cachedMatch = null;
  }

  sendStateSync(socket, room, match) {
    const player = socket.deserializeAttachment();
    const playerMatch =
      match?.fighters.some((fighter) => fighter.id === player?.id)
        ? match
        : null;
    sendServerMessage(socket, SERVER_MESSAGE_TYPES.STATE_SYNC, {
      state: {
        room: this.roomState(room, match).room,
        match: playerMatch
          ? playerSafeMatchState(playerMatch, player?.id)
          : null,
      },
    });
  }

  roomState(room, match = null) {
    const players = this.connectedPlayers().map((player) => ({
      id: player.id,
      name: player.name,
      characterId: player.characterId,
      ready: player.ready,
      isHost: player.id === room.hostPlayerId,
      connectedAt: player.connectedAt,
    }));
    const participantIds =
      match?.phase === MATCH_PHASES.GAMEOVER
        ? match.fighters.map((fighter) => fighter.id)
        : [];
    const connectedIds = new Set(players.map((player) => player.id));
    const votedPlayerIds = participantIds.filter((playerId) =>
      (match?.rematchVotes ?? []).includes(playerId),
    );
    const readyPlayers = players.filter(
      (player) => player.ready && player.characterId,
    );
    const canHostStart =
      !room.activeMatchId &&
      !match &&
      players.length >= MIN_PLAYERS &&
      readyPlayers.length === players.length;

    return createServerMessage(SERVER_MESSAGE_TYPES.ROOM_STATE, {
      room: {
        ...room,
        phase: match?.phase ?? MATCH_PHASES.LOBBY,
        minPlayers: MIN_PLAYERS,
        playerCount: players.length,
        canStart:
          !room.activeMatchId &&
          !match &&
          players.length === room.maxPlayers &&
          readyPlayers.length === players.length,
        canHostStart,
        rematch:
          match?.phase === MATCH_PHASES.GAMEOVER
            ? {
                matchId: match.id,
                votedPlayerIds,
                voteCount: votedPlayerIds.length,
                requiredCount: participantIds.length,
                allPlayersPresent: participantIds.every((playerId) =>
                  connectedIds.has(playerId),
                ),
              }
            : null,
        players,
      },
    });
  }

  connectedPlayers() {
    return this.ctx
      .getWebSockets()
      .map((socket) => socket.deserializeAttachment())
      .filter(Boolean)
      .sort((left, right) => left.connectedAt.localeCompare(right.connectedAt));
  }

  broadcastRoomState(room, match = null) {
    if (!room) return;
    const message = JSON.stringify(this.roomState(room, match));

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A close/error callback will remove disconnected sockets.
      }
    }
  }

  broadcastPhase(match) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const player = socket.deserializeAttachment();
        sendServerMessage(socket, SERVER_MESSAGE_TYPES.PHASE_STARTED, {
          matchId: match.id,
          phase: match.phase,
          beat: match.beat,
          deadlineAt: match.deadlineAt,
          state: playerSafeMatchState(match, player?.id, {
            includeLastResult: false,
          }),
        });
      } catch {
        // A close/error callback will remove disconnected sockets.
      }
    }
  }

}

function playerSafeMatchState(
  match,
  playerId,
  { includeLastResult = true } = {},
) {
  const freezePlayerIds =
    match.freezePlayerIds ??
    (match.freezePlayerId ? [match.freezePlayerId] : []);
  return {
    id: match.id,
    phase: match.phase,
    beat: match.beat,
    deadlineAt: match.deadlineAt,
    fighters: match.fighters.map((fighter) => ({
      id: fighter.id,
      name: fighter.name,
      characterId: fighter.characterId,
      hearts: fighter.hearts,
      alive: fighter.alive,
      powerUsed: fighter.powerUsed,
      powerUses: fighter.powerUses,
      hardened: fighter.hardened,
      dousedTurns: fighter.dousedTurns,
      dousedById: fighter.dousedById,
      lastAction: fighter.lastAction,
      ...(fighter.id === playerId ? { ammo: fighter.ammo } : {}),
    })),
    selection: match.selections[playerId] ?? null,
    freezePlayerIds,
    freezePlayerId: freezePlayerIds[0] ?? null,
    revealedActions:
      match.phase === MATCH_PHASES.FREEZE &&
      freezePlayerIds.includes(playerId)
        ? match.fighters
            .filter(
              (fighter) =>
                fighter.alive && fighter.id !== playerId,
            )
            .map((fighter) => ({
              fighterId: fighter.id,
              ...(match.frozenSelections?.[fighter.id] ?? {
                type: ACTIONS.WAIT,
              }),
            }))
        : null,
    ...(includeLastResult
      ? { lastResult: playerSafeBeatResult(match.lastResult, playerId) }
      : {}),
    matchResult: match.pendingEnd,
  };
}

function serializeBeatResult(result) {
  return {
    actions: [...result.selections].map(([fighterId, action]) => ({
      fighterId,
      ...action,
    })),
    events: result.events,
    damage: Object.fromEntries(result.damage),
    blockedShots: Object.fromEntries(result.blockedShots),
    reloaded: [...result.reloaded],
  };
}

function determineMatchEnd(fighters, events) {
  const civilianVictories = events.filter(
    (event) => event.type === "civilianVictory",
  );
  if (civilianVictories.length) {
    return {
      winnerId: civilianVictories[0].actorId,
      winnerIds: civilianVictories.map((event) => event.actorId),
      reason: "civilian_survived_five_powers",
    };
  }

  const survivors = fighters.filter((fighter) => fighter.alive);
  if (survivors.length === 1) {
    return {
      winnerId: survivors[0].id,
      winnerIds: [survivors[0].id],
      reason: "last_one_standing",
    };
  }
  return null;
}

function isActiveMatch(match) {
  return Boolean(match && match.phase !== MATCH_PHASES.GAMEOVER);
}

function isDurableQuotaError(error) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Exceeded allowed rows written") ||
    message.includes("Exceeded allowed rows read")
  );
}

function cleanPlayerName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || "Player").slice(0, 24);
}

function cleanCharacterId(value) {
  return isCharacterId(value) ? value : null;
}

function sendServerMessage(socket, type, payload = {}) {
  socket.send(JSON.stringify(createServerMessage(type, payload)));
}

function sendProtocolError(socket, code, message) {
  sendServerMessage(socket, SERVER_MESSAGE_TYPES.ERROR, { code, message });
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

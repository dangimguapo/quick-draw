import { ACTIONS } from "../public/src/engine.mjs";
import {
  CLIENT_MESSAGE_TYPES,
  MATCH_PHASES,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  createClientMessage,
  parseServerMessage
} from "../public/src/multiplayer-protocol.mjs";

const baseUrl = process.env.QUICK_DRAW_URL || "http://127.0.0.1:8787";

const health = await fetchJson(`${baseUrl}/api/health`);
assert(health.ok, "Worker health check failed.");
assert(
  health.protocolVersion === PROTOCOL_VERSION,
  "Worker and test protocol versions do not match."
);

const room = await fetchJson(
  `${baseUrl}/api/rooms`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ maxPlayers: 2 })
  },
  201
);
assert(room.roomCode, "Room creation did not return a room code.");
assert(room.maxPlayers === 5, "Online rooms must allow up to five players.");
assert(
  room.protocolVersion === PROTOCOL_VERSION,
  "Room protocol version was not returned."
);

const status = await fetchJson(`${baseUrl}${room.statusPath}`);
assert(status.room.code === room.roomCode, "Durable Object room was not saved.");
assert(
  status.room.minPlayers === 2 && status.room.maxPlayers === 5,
  "The room did not advertise its two-to-five player limits."
);

const host = connectPlayer(room.websocketPath, "host-smoke", "Host");
const connectedState = await waitForRoomState(host);
assert(connectedState.room.playerCount === 1, "Player did not join the room.");

const hostCharacter = waitForRoomState(
  host,
  (state) => state.room.players[0]?.characterId === "time-freeze"
);
host.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.PLAYER_UPDATE, {
      name: "Host",
      characterId: "time-freeze"
    })
  )
);
await hostCharacter;

const guest = connectPlayer(room.websocketPath, "guest-smoke", "Guest");
const twoPlayerState = await waitForRoomState(
  guest,
  (state) => state.room.playerCount === 2
);
assert(twoPlayerState.room.players[0].isHost, "The first player was not made host.");

const duplicateSelected = waitForRoomState(
  guest,
  (state) =>
    state.room.players.length === 2 &&
    state.room.players.every(
      (player) => player.characterId === "time-freeze"
    )
);
guest.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.PLAYER_UPDATE, {
      name: "Guest",
      characterId: "time-freeze"
    })
  )
);
await duplicateSelected;

const guestReady = waitForRoomState(
  guest,
  (state) =>
    state.room.players.find((player) => player.id === "guest-smoke")?.ready
);
guest.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
  )
);
await guestReady;

const matchPending = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.ERROR &&
    message.code === "match_not_started"
);
host.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
      matchId: "pending-match",
      beat: 1,
      action: { type: ACTIONS.BLOCK }
    })
  )
);
await matchPending;

const guestCannotStart = waitForMessage(
  guest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.ERROR &&
    message.code === "host_only"
);
guest.send(
  JSON.stringify(createClientMessage(CLIENT_MESSAGE_TYPES.START_MATCH))
);
await guestCannotStart;

const allReady = waitForRoomState(
  host,
  (state) => state.room.canHostStart && !state.room.canStart
);
host.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
  )
);
const readyState = await allReady;
assert(
  readyState.room.players.every((player) => player.ready),
  "Ready state was not synchronized."
);
assert(
  readyState.room.playerCount === 2 && readyState.room.maxPlayers === 5,
  "The two-player lobby did not remain open for optional players."
);

const hostMatchStarted = waitForMessage(
  host,
  (message) => message.type === SERVER_MESSAGE_TYPES.MATCH_START
);
const guestMatchStarted = waitForMessage(
  guest,
  (message) => message.type === SERVER_MESSAGE_TYPES.MATCH_START
);
const hostDecisionStarted = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.PHASE_STARTED &&
    message.phase === "decide" &&
    message.beat === 1
);
host.send(
  JSON.stringify(createClientMessage(CLIENT_MESSAGE_TYPES.START_MATCH))
);

const [hostStart, guestStart, decision] = await Promise.all([
  hostMatchStarted,
  guestMatchStarted,
  hostDecisionStarted
]);
assert(
  hostStart.matchId === guestStart.matchId,
  "Players were not assigned to the same authoritative match."
);
assert(
  hostStart.state.phase === "countdown" && hostStart.state.beat === 0,
  "The server did not begin with an authoritative countdown."
);
assertPrivateAmmo(hostStart.state, "host-smoke");
assertPrivateAmmo(guestStart.state, "guest-smoke");
assert(
  decision.matchId === hostStart.matchId,
  "The decision phase started for the wrong match."
);

const pong = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.PONG &&
    message.requestId === "smoke-ping"
);
host.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.PING, {
      requestId: "smoke-ping"
    })
  )
);
await pong;

const synced = waitForMessage(
  guest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.STATE_SYNC &&
    message.state?.room?.code === room.roomCode &&
    message.state?.match?.id === hostStart.matchId
);
guest.send(
  JSON.stringify(createClientMessage(CLIENT_MESSAGE_TYPES.SYNC_REQUEST))
);
const synchronizedState = await synced;
assertPrivateAmmo(synchronizedState.state.match, "guest-smoke");

const hostAccepted = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.ACTION_ACCEPTED &&
    message.matchId === hostStart.matchId &&
    message.beat === 1
);
const guestAccepted = waitForMessage(
  guest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.ACTION_ACCEPTED &&
    message.matchId === hostStart.matchId &&
    message.beat === 1
);
const hostFreezeStarted = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.PHASE_STARTED &&
    message.matchId === hostStart.matchId &&
    message.phase === "freeze" &&
    message.beat === 1
);
const guestFreezeStarted = waitForMessage(
  guest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.PHASE_STARTED &&
    message.matchId === hostStart.matchId &&
    message.phase === "freeze" &&
    message.beat === 1
);
const hostBeatResult = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.BEAT_RESULT &&
    message.matchId === hostStart.matchId &&
    message.beat === 1
);
const guestBeatResult = waitForMessage(
  guest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.BEAT_RESULT &&
    message.matchId === hostStart.matchId &&
    message.beat === 1
);
const secondDecision = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.PHASE_STARTED &&
    message.matchId === hostStart.matchId &&
    message.phase === "decide" &&
    message.beat === 2
);
host.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
      matchId: hostStart.matchId,
      beat: 1,
      action: { type: ACTIONS.POWER }
    })
  )
);
guest.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
      matchId: hostStart.matchId,
      beat: 1,
      action: { type: ACTIONS.POWER }
    })
  )
);
await Promise.all([hostAccepted, guestAccepted]);

const [hostFreeze, guestFreeze] = await Promise.all([
  hostFreezeStarted,
  guestFreezeStarted
]);
assert(
  hostFreeze.state.freezePlayerIds?.includes("host-smoke") &&
    hostFreeze.state.freezePlayerIds?.includes("guest-smoke"),
  "Both Time Freeze owners did not receive the shared response window."
);
assert(
  hostFreeze.state.revealedActions?.some(
    (action) =>
      action.fighterId === "guest-smoke" &&
      action.type === ACTIONS.POWER
  ),
  "Host Time Freeze did not privately reveal the rival action."
);
assert(
  guestFreeze.state.freezePlayerIds?.includes("host-smoke") &&
    guestFreeze.state.freezePlayerIds?.includes("guest-smoke") &&
    guestFreeze.state.revealedActions?.some(
      (action) =>
        action.fighterId === "host-smoke" &&
        action.type === ACTIONS.POWER
    ),
  "Guest Time Freeze did not receive its private rival action."
);
assertPrivateAmmo(hostFreeze.state, "host-smoke");
assertPrivateAmmo(guestFreeze.state, "guest-smoke");

const hostFreezeResponseAccepted = waitForMessage(
  host,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.ACTION_ACCEPTED &&
    message.matchId === hostStart.matchId &&
    message.beat === 1 &&
    message.action.type === ACTIONS.BLOCK
);
const guestFreezeResponseAccepted = waitForMessage(
  guest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.ACTION_ACCEPTED &&
    message.matchId === hostStart.matchId &&
    message.beat === 1 &&
    message.action.type === ACTIONS.RELOAD
);
host.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
      matchId: hostStart.matchId,
      beat: 1,
      action: { type: ACTIONS.BLOCK }
    })
  )
);
guest.send(
  JSON.stringify(
    createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
      matchId: hostStart.matchId,
      beat: 1,
      action: { type: ACTIONS.RELOAD }
    })
  )
);
await Promise.all([
  hostFreezeResponseAccepted,
  guestFreezeResponseAccepted
]);

const [hostResult, guestResult] = await Promise.all([
  hostBeatResult,
  guestBeatResult
]);
assert(
  guestResult.result.actions.some(
    (action) =>
      action.fighterId === "guest-smoke" &&
      action.type === ACTIONS.RELOAD
  ),
  "The server did not resolve the guest Time Freeze response."
);
assert(
  hostResult.result.actions.some(
    (action) =>
      action.fighterId === "host-smoke" && action.type === ACTIONS.BLOCK
  ),
  "The server did not resolve the Time Freeze response."
);
assert(
  ["host-smoke", "guest-smoke"].every((fighterId) =>
    hostResult.result.events.some(
      (event) =>
        event.type === "power" &&
        event.actorId === fighterId &&
        event.powerId === "time-freeze"
    )
  ),
  "Both Time Freeze uses were not included in the public result."
);
assertPrivateAmmo(hostResult.result.state, "host-smoke");
assertPrivateAmmo(guestResult.result.state, "guest-smoke");
assert(
  guestResult.result.state.fighters.find(
    (fighter) => fighter.id === "guest-smoke"
  )?.ammo === 1,
  "The guest Time Freeze reload response was not applied."
);
assert(
  hostResult.result.state.fighters.find(
    (fighter) => fighter.id === "host-smoke"
  )?.powerUsed,
  "Time Freeze was not consumed after use."
);
assert(
  guestResult.result.state.fighters.find(
    (fighter) => fighter.id === "guest-smoke"
  )?.powerUsed,
  "Guest Time Freeze was not consumed after use."
);
await secondDecision;

guest.close();
const reconnectedGuest = connectPlayer(
  room.websocketPath,
  "guest-smoke",
  "Guest"
);
const reconnectedState = await waitForMessage(
  reconnectedGuest,
  (message) =>
    message.type === SERVER_MESSAGE_TYPES.STATE_SYNC &&
    message.state?.match?.id === hostStart.matchId &&
    message.state.match.beat === 2
);
assertPrivateAmmo(reconnectedState.state.match, "guest-smoke");

host.close();
reconnectedGuest.close();
await verifyFivePlayerRoom();
await verifyOnlineRematch();
await verifyHostDepartureDeletesRoom();
console.log(
  `Worker, five-player rooms, duplicate powers, rematches, host cleanup, private ammunition, alarms, and sync are ready (${room.roomCode}).`
);

async function verifyFivePlayerRoom() {
  const room = await fetchJson(
    `${baseUrl}/api/rooms`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: 5 })
    },
    201
  );
  assert(room.maxPlayers === 5, "Five-player room capacity was not saved.");

  const roster = [
    ["five-host", "Five Host", "quickdraw"],
    ["five-two", "Five Two", "body-boulder"],
    ["five-three", "Five Three", "sheriff"],
    ["five-four", "Five Four", "mirror"],
    ["five-five", "Five Five", "civilian"]
  ];
  const sockets = [];
  for (const [playerId, name] of roster) {
    const socket = connectPlayer(room.websocketPath, playerId, name);
    sockets.push(socket);
    await waitForRoomState(
      socket,
      (state) => state.room.playerCount === sockets.length
    );
  }

  const matchStarts = sockets.map((socket) =>
    waitForMessage(
      socket,
      (message) => message.type === SERVER_MESSAGE_TYPES.MATCH_START
    )
  );
  for (let index = 0; index < roster.length; index += 1) {
    const [playerId, name, characterId] = roster[index];
    const socket = sockets[index];
    const readyState = waitForRoomState(
      socket,
      (state) => {
        const player = state.room.players.find(
          (candidate) => candidate.id === playerId
        );
        return player?.characterId === characterId && player.ready;
      }
    );
    socket.send(
      JSON.stringify(
        createClientMessage(CLIENT_MESSAGE_TYPES.PLAYER_UPDATE, {
          name,
          characterId
        })
      )
    );
    socket.send(
      JSON.stringify(
        createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
      )
    );
    await readyState;
  }

  const starts = await Promise.all(matchStarts);
  const matchIds = new Set(starts.map((message) => message.matchId));
  assert(matchIds.size === 1, "Five players did not enter the same match.");
  assert(
    starts.every(
      (message) =>
        message.state.phase === MATCH_PHASES.COUNTDOWN &&
        message.state.fighters.length === 5
    ),
    "The five-player match did not include all five fresh fighters."
  );
  for (const socket of sockets) socket.close();
}

async function verifyOnlineRematch() {
  const room = await fetchJson(
    `${baseUrl}/api/rooms`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: 2 })
    },
    201
  );
  const host = connectPlayer(room.websocketPath, "rematch-host", "Rematch Host");
  await waitForRoomState(host);

  const hostSelected = waitForRoomState(
    host,
    (state) =>
      state.room.players.find((player) => player.id === "rematch-host")
        ?.characterId === "quickdraw"
  );
  host.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.PLAYER_UPDATE, {
        name: "Rematch Host",
        characterId: "quickdraw"
      })
    )
  );
  await hostSelected;

  const guest = connectPlayer(
    room.websocketPath,
    "rematch-guest",
    "Rematch Guest"
  );
  await waitForRoomState(guest, (state) => state.room.playerCount === 2);
  const guestReady = waitForRoomState(
    guest,
    (state) => {
      const player = state.room.players.find(
        (candidate) => candidate.id === "rematch-guest"
      );
      return player?.characterId === "civilian" && player.ready;
    }
  );
  guest.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.PLAYER_UPDATE, {
        name: "Rematch Guest",
        characterId: "civilian"
      })
    )
  );
  guest.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
    )
  );
  await guestReady;

  const rematchLobbyReady = waitForRoomState(
    host,
    (state) => state.room.canHostStart && !state.room.canStart
  );
  host.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
    )
  );
  await rematchLobbyReady;

  const hostStarted = waitForMessage(
    host,
    (message) => message.type === SERVER_MESSAGE_TYPES.MATCH_START
  );
  const guestStarted = waitForMessage(
    guest,
    (message) => message.type === SERVER_MESSAGE_TYPES.MATCH_START
  );
  const decisionStarted = waitForMessage(
    host,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.PHASE_STARTED &&
      message.phase === MATCH_PHASES.DECIDE &&
      message.beat === 1
  );
  host.send(
    JSON.stringify(createClientMessage(CLIENT_MESSAGE_TYPES.START_MATCH))
  );
  const [firstHostStart, firstGuestStart] = await Promise.all([
    hostStarted,
    guestStarted
  ]);
  assert(
    firstHostStart.matchId === firstGuestStart.matchId,
    "The rematch test did not begin in one shared match."
  );
  await decisionStarted;

  const hostEnded = waitForMessage(
    host,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.MATCH_END &&
      message.matchId === firstHostStart.matchId
  );
  const guestEnded = waitForMessage(
    guest,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.MATCH_END &&
      message.matchId === firstHostStart.matchId
  );
  const gameoverRoom = waitForRoomState(
    host,
    (state) =>
      state.room.rematch?.matchId === firstHostStart.matchId &&
      state.room.rematch.requiredCount === 2
  );
  host.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
        matchId: firstHostStart.matchId,
        beat: 1,
        action: { type: ACTIONS.POWER, targetId: "rematch-guest" }
      })
    )
  );
  guest.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.ACTION_SUBMIT, {
        matchId: firstHostStart.matchId,
        beat: 1,
        action: { type: ACTIONS.POWER }
      })
    )
  );
  const [hostEnd, guestEnd] = await Promise.all([hostEnded, guestEnded]);
  await gameoverRoom;
  assert(
    hostEnd.result.winnerId === "rematch-host" &&
      guestEnd.result.winnerId === "rematch-host",
    "The rematch setup match did not end authoritatively."
  );

  const oneVote = waitForRoomState(
    host,
    (state) =>
      state.room.rematch?.voteCount === 1 &&
      state.room.rematch.votedPlayerIds.includes("rematch-host")
  );
  host.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.REMATCH_VOTE, { vote: true })
    )
  );
  await oneVote;

  const hostReturnedToSelect = waitForRoomState(
    host,
    (state) =>
      state.room.phase === MATCH_PHASES.LOBBY &&
      state.room.rematch === null &&
      state.room.players.every((player) => !player.ready)
  );
  const guestReturnedToSelect = waitForRoomState(
    guest,
    (state) =>
      state.room.phase === MATCH_PHASES.LOBBY &&
      state.room.rematch === null &&
      state.room.players.every((player) => !player.ready)
  );
  guest.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.REMATCH_VOTE, { vote: true })
    )
  );
  await Promise.all([
    hostReturnedToSelect,
    guestReturnedToSelect
  ]);

  const syncedLobby = waitForMessage(
    host,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.STATE_SYNC &&
      message.state?.room?.phase === MATCH_PHASES.LOBBY &&
      message.state.match === null
  );
  host.send(
    JSON.stringify(createClientMessage(CLIENT_MESSAGE_TYPES.SYNC_REQUEST))
  );
  await syncedLobby;

  const hostChangedFighter = waitForRoomState(
    host,
    (state) =>
      state.room.players.find((player) => player.id === "rematch-host")
        ?.characterId === "sheriff"
  );
  host.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.PLAYER_UPDATE, {
        name: "Rematch Host",
        characterId: "sheriff"
      })
    )
  );
  await hostChangedFighter;

  const guestReadyAgain = waitForRoomState(
    host,
    (state) =>
      state.room.players.find((player) => player.id === "rematch-guest")
        ?.ready === true
  );
  guest.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
    )
  );
  await guestReadyAgain;

  const rematchReadyToStart = waitForRoomState(
    host,
    (state) => state.room.canHostStart && !state.room.canStart
  );
  host.send(
    JSON.stringify(
      createClientMessage(CLIENT_MESSAGE_TYPES.READY, { ready: true })
    )
  );
  await rematchReadyToStart;

  const rematchHostStarted = waitForMessage(
    host,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.MATCH_START &&
      message.matchId !== firstHostStart.matchId
  );
  const rematchGuestStarted = waitForMessage(
    guest,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.MATCH_START &&
      message.matchId !== firstHostStart.matchId
  );
  host.send(
    JSON.stringify(createClientMessage(CLIENT_MESSAGE_TYPES.START_MATCH))
  );
  const [nextHostStart, nextGuestStart] = await Promise.all([
    rematchHostStarted,
    rematchGuestStarted
  ]);
  assert(
    nextHostStart.matchId === nextGuestStart.matchId,
    "Rematch players did not receive the same new match."
  );
  assert(
    nextHostStart.state.phase === MATCH_PHASES.COUNTDOWN &&
      nextHostStart.state.fighters.every(
        (fighter) => !fighter.powerUsed && fighter.powerUses === 0
      ),
    "The rematch did not reset fighter health, powers, and countdown state."
  );
  assert(
    nextHostStart.state.fighters.some(
      (fighter) =>
        fighter.id === "rematch-host" &&
        fighter.characterId === "sheriff" &&
        fighter.hearts === 3
    ) &&
      nextHostStart.state.fighters.some(
        (fighter) =>
          fighter.id === "rematch-guest" &&
          fighter.characterId === "civilian" &&
          fighter.hearts === 1
      ),
    "The rematch did not preserve player identities and apply new fighter choices."
  );

  host.close();
  guest.close();
}

async function verifyHostDepartureDeletesRoom() {
  const room = await fetchJson(
    `${baseUrl}/api/rooms`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: 5 })
    },
    201
  );
  const host = connectPlayer(
    room.websocketPath,
    "cleanup-host",
    "Cleanup Host"
  );
  await waitForRoomState(host);
  const guest = connectPlayer(
    room.websocketPath,
    "cleanup-guest",
    "Cleanup Guest"
  );
  await waitForRoomState(guest, (state) => state.room.playerCount === 2);

  const guestClosed = waitForSocketClose(guest);
  host.close();
  await waitForRoomDeletion(room.statusPath);
  guest.close();
  const closeEvent = await guestClosed;
  assert(closeEvent.code === 4004, "Guests were not told the host closed the room.");
}

async function fetchJson(url, init, expectedStatus = 200) {
  const response = await fetch(url, init);
  const body = await response.json();
  assert(
    response.status === expectedStatus,
    `${url} returned ${response.status}: ${JSON.stringify(body)}`
  );
  return body;
}

function connectPlayer(path, playerId, name) {
  const socketUrl = new URL(path, baseUrl);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.searchParams.set("playerId", playerId);
  socketUrl.searchParams.set("name", name);
  socketUrl.searchParams.set("protocolVersion", String(PROTOCOL_VERSION));
  return new WebSocket(socketUrl);
}

function waitForRoomState(socket, predicate = () => true) {
  return waitForMessage(
    socket,
    (message) =>
      message.type === SERVER_MESSAGE_TYPES.ROOM_STATE && predicate(message)
  );
}

function waitForMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for a server message.")),
      15000
    );

    const onError = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed."));
    };

    const onMessage = (event) => {
      const parsed = parseServerMessage(event.data);
      if (!parsed.ok) {
        clearTimeout(timeout);
        reject(new Error(parsed.error.message));
        return;
      }
      const message = parsed.value;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };

    socket.addEventListener("error", onError, { once: true });
    socket.addEventListener("message", onMessage);
  });
}

function waitForSocketClose(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for the room to close.")),
      15000
    );
    socket.addEventListener(
      "close",
      (event) => {
        clearTimeout(timeout);
        resolve(event);
      },
      { once: true }
    );
  });
}

async function waitForRoomDeletion(statusPath) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}${statusPath}`);
    if (response.status === 404) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The host's room data was not deleted.");
}

function assertPrivateAmmo(state, playerId) {
  for (const fighter of state.fighters) {
    if (fighter.id === playerId) {
      assert(
        Number.isInteger(fighter.ammo),
        "A player did not receive their own ammunition."
      );
    } else {
      assert(
        !Object.hasOwn(fighter, "ammo"),
        "An opponent's private ammunition was exposed."
      );
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

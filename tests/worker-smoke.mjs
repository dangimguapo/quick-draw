const baseUrl = process.env.QUICK_DRAW_URL || "http://127.0.0.1:8787";

const health = await fetchJson(`${baseUrl}/api/health`);
assert(health.ok, "Worker health check failed.");

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
assert(room.maxPlayers === 2, "Room capacity was not saved.");

const status = await fetchJson(`${baseUrl}${room.statusPath}`);
assert(status.room.code === room.roomCode, "Durable Object room was not saved.");

const host = connectPlayer(room.websocketPath, "host-smoke", "Host");
const connectedState = await waitForRoomState(host);
assert(connectedState.room.playerCount === 1, "Player did not join the room.");

const hostCharacter = waitForRoomState(
  host,
  (state) => state.room.players[0]?.characterId === "quickdraw"
);
host.send(
  JSON.stringify({
    type: "player_update",
    name: "Host",
    characterId: "quickdraw"
  })
);
await hostCharacter;

const guest = connectPlayer(room.websocketPath, "guest-smoke", "Guest");
const twoPlayerState = await waitForRoomState(
  guest,
  (state) => state.room.playerCount === 2
);
assert(twoPlayerState.room.players[0].isHost, "The first player was not made host.");

const duplicateRejected = waitForMessage(
  guest,
  (message) => message.type === "error" && message.error.includes("claimed")
);
guest.send(
  JSON.stringify({
    type: "player_update",
    name: "Guest",
    characterId: "quickdraw"
  })
);
await duplicateRejected;

const guestReady = waitForRoomState(
  guest,
  (state) =>
    state.room.players.find((player) => player.id === "guest-smoke")?.ready
);
guest.send(
  JSON.stringify({
    type: "player_update",
    name: "Guest",
    characterId: "maniac"
  })
);
guest.send(JSON.stringify({ type: "ready", ready: true }));
await guestReady;

const allReady = waitForRoomState(host, (state) => state.room.canStart);
host.send(JSON.stringify({ type: "ready", ready: true }));
const readyState = await allReady;
assert(
  readyState.room.players.every((player) => player.ready),
  "Ready state was not synchronized."
);

host.close();
guest.close();
console.log(`Worker, lobby, and Durable Object are ready (${room.roomCode}).`);

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
  return new WebSocket(socketUrl);
}

function waitForRoomState(socket, predicate = () => true) {
  return waitForMessage(
    socket,
    (message) => message.type === "room_state" && predicate(message)
  );
}

function waitForMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for room state.")),
      5000
    );

    const onError = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed."));
    };

    const onMessage = (event) => {
      const message = JSON.parse(event.data);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

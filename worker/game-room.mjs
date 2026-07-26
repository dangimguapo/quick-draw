import { DurableObject } from "cloudflare:workers";

const CHARACTER_IDS = new Set([
  "quickdraw",
  "body-boulder",
  "sheriff",
  "mirror",
  "time-freeze",
  "maniac",
  "civilian"
]);

export class GameRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const roomCode = request.headers.get("x-quick-draw-room");

    if (request.method === "POST" && url.pathname === "/initialize") {
      const existing = await this.ctx.storage.get("room");
      if (!existing) {
        await this.ctx.storage.put("room", {
          code: roomCode,
          createdAt: new Date().toISOString(),
          maxPlayers:
            request.headers.get("x-quick-draw-max-players") === "3" ? 3 : 2,
          hostPlayerId: null
        });
      }

      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const room = await this.ctx.storage.get("room");
      if (!room) {
        return json({ error: "Room not found" }, { status: 404 });
      }

      return json(this.roomState(room));
    }

    if (request.method === "GET" && url.pathname === "/connect") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return json(
          { error: "Expected a WebSocket upgrade request." },
          { status: 426 }
        );
      }

      const room = await this.ctx.storage.get("room");
      if (!room) {
        return json({ error: "Room not found" }, { status: 404 });
      }

      const playerId = url.searchParams.get("playerId") || crypto.randomUUID();
      const currentSockets = this.ctx.getWebSockets();
      const replacedSocket = currentSockets.find(
        (socket) => socket.deserializeAttachment()?.id === playerId
      );
      if (replacedSocket) {
        replacedSocket.close(4001, "Reconnected from another tab");
      }

      const activePlayers = currentSockets.filter(
        (socket) => socket !== replacedSocket
      );
      if (activePlayers.length >= room.maxPlayers) {
        return json({ error: "Room is full" }, { status: 409 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const player = {
        id: playerId,
        name: cleanPlayerName(url.searchParams.get("name")),
        characterId: null,
        ready: false,
        connectedAt: new Date().toISOString()
      };

      if (!room.hostPlayerId) {
        room.hostPlayerId = player.id;
        await this.ctx.storage.put("room", room);
      }

      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(player);
      this.broadcastRoomState(room);

      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "Not found" }, { status: 404 });
  }

  async webSocketMessage(socket, message) {
    const player = socket.deserializeAttachment();
    let event;

    try {
      event = JSON.parse(message);
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
      return;
    }

    if (event.type === "ping") {
      socket.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (event.type === "ready") {
      if (!player.characterId) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: "Choose a fighter before getting ready."
          })
        );
        return;
      }

      player.ready = Boolean(event.ready);
      socket.serializeAttachment(player);
      const room = await this.ctx.storage.get("room");
      this.broadcastRoomState(room);
      return;
    }

    if (event.type === "player_update") {
      const characterId = cleanCharacterId(event.characterId);
      const characterTaken = this.ctx
        .getWebSockets()
        .some(
          (otherSocket) =>
            otherSocket !== socket &&
            otherSocket.deserializeAttachment()?.characterId === characterId
        );

      if (!characterId || characterTaken) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: characterTaken
              ? "That fighter was already claimed."
              : "Unknown fighter."
          })
        );
        return;
      }

      player.characterId = characterId;
      player.name = cleanPlayerName(event.name || player.name);
      player.ready = false;
      socket.serializeAttachment(player);
      const room = await this.ctx.storage.get("room");
      this.broadcastRoomState(room);
      return;
    }

    socket.send(
      JSON.stringify({ type: "error", error: "Unsupported message type" })
    );
  }

  async webSocketClose(socket) {
    const departedPlayer = socket.deserializeAttachment();
    socket.close(1000, "Connection closed");
    const room = await this.reassignHostIfNeeded(departedPlayer?.id);
    this.broadcastRoomState(room);
  }

  async webSocketError(socket) {
    const departedPlayer = socket.deserializeAttachment();
    const room = await this.reassignHostIfNeeded(departedPlayer?.id);
    this.broadcastRoomState(room);
  }

  roomState(room) {
    const players = this.ctx
      .getWebSockets()
      .map((socket) => {
        const player = socket.deserializeAttachment();
        return {
          id: player.id,
          name: player.name,
          characterId: player.characterId,
          ready: player.ready,
          isHost: player.id === room.hostPlayerId,
          connectedAt: player.connectedAt
        };
      })
      .sort((left, right) => left.connectedAt.localeCompare(right.connectedAt));

    return {
      type: "room_state",
      room: {
        ...room,
        playerCount: players.length,
        canStart:
          players.length === room.maxPlayers &&
          players.every((player) => player.ready && player.characterId),
        players
      }
    };
  }

  broadcastRoomState(room) {
    if (!room) return;
    const message = JSON.stringify(this.roomState(room));

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A close/error callback will remove disconnected sockets.
      }
    }
  }

  async reassignHostIfNeeded(departedPlayerId) {
    const room = await this.ctx.storage.get("room");
    if (!room || room.hostPlayerId !== departedPlayerId) return room;

    const nextHost = this.ctx
      .getWebSockets()
      .map((socket) => socket.deserializeAttachment())
      .find((player) => player?.id && player.id !== departedPlayerId);
    room.hostPlayerId = nextHost?.id ?? null;
    await this.ctx.storage.put("room", room);
    return room;
  }
}

function cleanPlayerName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || "Player").slice(0, 24);
}

function cleanCharacterId(value) {
  return typeof value === "string" && CHARACTER_IDS.has(value) ? value : null;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

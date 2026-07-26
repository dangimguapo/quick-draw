import { GameRoom } from "./game-room.mjs";

export { GameRoom };

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "quick-draw-worker",
        durableObjects: true
      });
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const options = await readRoomOptions(request);
      const roomCode = options.roomCode || createRoomCode();

      if (!ROOM_CODE_PATTERN.test(roomCode)) {
        return json(
          { error: "Room codes must be six letters or numbers." },
          { status: 400 }
        );
      }

      const response = await roomStub(env, roomCode).fetch(
        roomRequest(request, "/initialize", roomCode, {
          "x-quick-draw-max-players": String(options.maxPlayers)
        })
      );

      if (!response.ok) {
        return response;
      }

      return json(
        {
          roomCode,
          maxPlayers: options.maxPlayers,
          statusPath: `/api/rooms/${roomCode}`,
          websocketPath: `/ws/rooms/${roomCode}`
        },
        { status: 201 }
      );
    }

    const statusMatch = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})$/);
    if (request.method === "GET" && statusMatch) {
      const roomCode = statusMatch[1];
      return roomStub(env, roomCode).fetch(
        roomRequest(request, "/status", roomCode)
      );
    }

    const socketMatch = url.pathname.match(/^\/ws\/rooms\/([A-Z2-9]{6})$/);
    if (request.method === "GET" && socketMatch) {
      const roomCode = socketMatch[1];
      return roomStub(env, roomCode).fetch(
        roomRequest(request, `/connect${url.search}`, roomCode)
      );
    }

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};

function roomStub(env, roomCode) {
  const id = env.GAME_ROOMS.idFromName(roomCode);
  return env.GAME_ROOMS.get(id);
}

function roomRequest(originalRequest, pathname, roomCode, extraHeaders = {}) {
  const url = new URL(originalRequest.url);
  url.pathname = pathname.split("?")[0];
  url.search = pathname.includes("?") ? `?${pathname.split("?")[1]}` : "";

  const headers = new Headers(originalRequest.headers);
  headers.set("x-quick-draw-room", roomCode);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return new Request(url, {
    method: originalRequest.method,
    headers
  });
}

async function readRoomOptions(request) {
  const fallback = { roomCode: null, maxPlayers: 2 };
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fallback;
  }

  try {
    const body = await request.json();
    return {
      roomCode:
        typeof body.roomCode === "string"
          ? body.roomCode.trim().toUpperCase()
          : null,
      maxPlayers: Number(body.maxPlayers) === 3 ? 3 : 2
    };
  } catch {
    return fallback;
  }
}

function createRoomCode() {
  const values = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(
    values,
    (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]
  ).join("");
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

(() => {
const {
  ACTIONS,
  CIVILIAN_POWER_GOAL,
  POWER_IDS,
  canUsePower,
  chooseRobotAction,
  createFighter,
  outcomePoseFor,
  powerIdFor,
  powerNeedsTarget,
  resolveTurn,
} = window.QuickDrawEngine;

const DECIDE_MS = 1000;
const REVEAL_MS = 0;
const OUTCOME_MS = 3000;

const CHARACTERS = Object.freeze([
  {
    id: "quickdraw",
    name: "Quickdraw",
    shortName: "Quickdraw",
    initial: "Q",
    tagline: "First to the trigger, even with an empty chamber.",
    powerName: "Quickdraw",
    powerDescription: "Reload and shoot in the same beat — even as your first move.",
    color: "#c0392b",
    image: "./assets/characters/quickdraw-icon-8bit.png",
    fullBodyImage: "./assets/characters/quickdraw-fullbody-8bit.png",
    actionImages: Object.freeze({
      idle: "./assets/characters/quickdraw-fullbody-8bit.png",
      block: "./assets/characters/quickdraw-block-8bit.png",
      reload: "./assets/characters/quickdraw-reload-8bit.png",
      fire: "./assets/characters/quickdraw-fire-8bit.png",
      power: "./assets/characters/quickdraw-power-8bit.png",
      hit: "./assets/characters/quickdraw-hit-8bit.png",
    }),
    available: true,
  },
  {
    id: "body-boulder",
    name: "Body Boulder",
    shortName: "Boulder",
    initial: "B",
    tagline: "Built like the canyon and twice as stubborn.",
    powerName: "Harden",
    powerDescription: "Gain a fourth heart. The stone skin breaks the first time you’re hit.",
    color: "#8a5a2b",
    available: true,
  },
  {
    id: "sheriff",
    name: "Sheriff",
    shortName: "Sheriff",
    initial: "S",
    tagline: "Keeps the peace with a very full chamber.",
    powerName: "6 in the Chamber",
    powerDescription: "Load six bullets in a single beat instead of one.",
    color: "#3b5b86",
    image: "./assets/characters/sheriff-icon-8bit.png",
    fullBodyImage: "./assets/characters/sheriff-fullbody-8bit.png",
    actionImages: Object.freeze({
      idle: "./assets/characters/sheriff-fullbody-8bit.png",
      block: "./assets/characters/sheriff-block-8bit.png",
      reload: "./assets/characters/sheriff-reload-8bit.png",
      fire: "./assets/characters/sheriff-fire-8bit.png",
      power: "./assets/characters/sheriff-power-8bit.png",
      hit: "./assets/characters/sheriff-hit-8bit.png",
    }),
    available: true,
  },
  {
    id: "mirror",
    name: "Mirror",
    shortName: "Mirror",
    initial: "M",
    tagline: "Whatever you try, Mirror sends it right back.",
    powerName: "Mirror",
    powerDescription: "Copy one rival’s block or reload, or reflect their shot back.",
    color: "#9aa2ab",
    image: "./assets/characters/mirror-icon-8bit.png",
    fullBodyImage: "./assets/characters/mirror-fullbody-8bit.png",
    actionImages: Object.freeze({
      idle: "./assets/characters/mirror-fullbody-8bit.png",
      block: "./assets/characters/mirror-block-8bit.png",
      reload: "./assets/characters/mirror-reload-8bit.png",
      fire: "./assets/characters/mirror-fire-8bit.png",
      power: "./assets/characters/mirror-power-8bit.png",
      hit: "./assets/characters/mirror-hit-8bit.png",
    }),
    available: true,
  },
  {
    id: "time-freeze",
    name: "Time Freeze",
    shortName: "Freeze",
    initial: "T",
    tagline: "Stops the clock and studies every twitch.",
    powerName: "Time Freeze",
    powerDescription: "Reveal every rival’s move, then take four extra seconds to answer.",
    color: "#cfc7ae",
    image: "./assets/characters/time-freeze-icon-8bit.png",
    fullBodyImage: "./assets/characters/time-freeze-fullbody-8bit.png",
    actionImages: Object.freeze({
      idle: "./assets/characters/time-freeze-fullbody-8bit.png",
      block: "./assets/characters/time-freeze-block-8bit.png",
      reload: "./assets/characters/time-freeze-reload-8bit.png",
      fire: "./assets/characters/time-freeze-fire-8bit.png",
      power: "./assets/characters/time-freeze-power-8bit.png",
      hit: "./assets/characters/time-freeze-hit-8bit.png",
    }),
    available: true,
  },
  {
    id: "maniac",
    name: "Maniac",
    shortName: "Maniac",
    initial: "!",
    tagline: "One target was never going to be enough.",
    powerName: "Maniac",
    powerDescription: "Shoot everyone. If they all block, the final bullet is your own.",
    color: "#7d2b20",
    available: true,
  },
  {
    id: "civilian",
    name: "Civilian",
    shortName: "Civilian",
    initial: "C",
    tagline: "No weapon. One heart. Five chances to survive.",
    powerName: "Survive",
    powerDescription: "Use Survive five times without being eliminated to win the duel.",
    color: "#6f7a55",
    available: true,
  },
]);

const ROSTER_SLOT_COUNT = 12;

const TUTORIAL_STEPS = Object.freeze([
  {
    eyebrow: "STEP 1 · THE CLOCK",
    title: "LEARN AT YOUR OWN PACE",
    body: "This trainer pauses before every move. In a real duel, you get one second to choose and one second to watch every move resolve.",
    expected: "intro",
    button: "BEGIN TRAINING",
    event: "Training paused",
  },
  {
    eyebrow: "STEP 2 · YOUR HUD",
    title: "LOAD YOUR FIRST SHOT",
    body: "Your hearts and ammunition are shown in the lower corner. Rival ammunition is always private. You have 0 shots, so tap RELOAD now.",
    expected: "reload",
    event: "Tap the glowing RELOAD button",
  },
  {
    eyebrow: "STEP 3 · ATTACK",
    title: "RELOAD WORKED",
    body: "Riley blocked while you reloaded, so you now have 1 shot. FIRE spends that shot and hits a rival who does not block. Tap FIRE.",
    expected: "fire",
    event: "You reloaded · Riley blocked",
  },
  {
    eyebrow: "STEP 4 · DEFEND",
    title: "THE SHOT LANDED",
    body: "Riley lost one heart and your ammunition returned to 0. Riley is loaded now—tap BLOCK to stop the incoming shot.",
    expected: "block",
    event: "Direct hit · Riley lost a heart",
  },
  {
    eyebrow: "STEP 5 · YOUR ABILITY",
    title: "USE YOUR POWER",
    body: "BLOCK protected every heart. Each character has a different POWER ability. Most can be used once per duel; the Civilian’s survival power is repeatable. Tap POWER.",
    expected: "power",
    event: "Blocked · No hearts lost",
  },
  {
    eyebrow: "STEP 6 · REAL SPEED",
    title: "TRY A LIVE BEAT",
    body: "Your POWER is now used and stays grey. In Trio matches, targeted FIRE and POWER buttons map to specific rivals. Next, choose any available move in one second.",
    expected: "speed",
    button: "START 1-SECOND BEAT",
    event: "Power used · One use per duel",
  },
  {
    eyebrow: "TRAINING COMPLETE",
    title: "READY FOR QUICK DRAW",
    body: "You loaded, fired, blocked, used an ability, and made a choice at full speed. Protect your hearts and be the last gunslinger standing.",
    expected: "finish",
    button: "START A DUEL",
    event: "Live-speed move locked in",
  },
]);

const ui = {
  home: document.querySelector("#homeScreen"),
  tutorial: document.querySelector("#tutorialGameScreen"),
  character: document.querySelector("#characterScreen"),
  combat: document.querySelector("#combatScreen"),
  result: document.querySelector("#resultScreen"),
  titleMenu: document.querySelector("#titleMenu"),
  setupCard: document.querySelector("#setupCard"),
  openDuelSetup: document.querySelector("#openDuelSetupButton"),
  closeSetup: document.querySelector("#closeSetupButton"),
  openSettings: document.querySelector("#openSettingsButton"),
  openTutorial: document.querySelector("#openTutorialButton"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettings: document.querySelector("#closeSettingsButton"),
  handedness: document.querySelector("#handednessButton"),
  exitTutorial: document.querySelector("#exitTutorialButton"),
  tutorialStepLabel: document.querySelector("#tutorialStepLabel"),
  tutorialPhaseLabel: document.querySelector("#tutorialPhaseLabel"),
  tutorialBeatProgress: document.querySelector("#tutorialBeatProgress"),
  tutorialCoach: document.querySelector(".tutorial-coach"),
  tutorialCoachEyebrow: document.querySelector("#tutorialCoachEyebrow"),
  tutorialCoachTitle: document.querySelector("#tutorialCoachTitle"),
  tutorialCoachBody: document.querySelector("#tutorialCoachBody"),
  tutorialCoachButton: document.querySelector("#tutorialCoachButton"),
  tutorialEventBanner: document.querySelector("#tutorialEventBanner"),
  tutorialAmmoCount: document.querySelector("#tutorialAmmoCount"),
  tutorialRivalHearts: document.querySelector("#tutorialRivalHearts"),
  tutorialPlayerHearts: document.querySelector("#tutorialPlayerHearts"),
  tutorialActions: [...document.querySelectorAll("[data-tutorial-action]")],
  localSetup: document.querySelector("#localSetup"),
  onlineSetup: document.querySelector("#onlineSetup"),
  onlinePlayerName: document.querySelector("#onlinePlayerName"),
  joinRoomCode: document.querySelector("#joinRoomCode"),
  createRoom: document.querySelector("#createRoomButton"),
  joinRoom: document.querySelector("#joinRoomButton"),
  onlineStatus: document.querySelector("#onlineStatus"),
  start: document.querySelector("#startButton"),
  backToHome: document.querySelector("#backToHomeButton"),
  characterGrid: document.querySelector("#characterGrid"),
  characterFeature: document.querySelector(".character-feature"),
  characterGlow: document.querySelector("#characterGlow"),
  heroCharacterImage: document.querySelector("#heroCharacterImage"),
  comingSoonHero: document.querySelector("#comingSoonHero"),
  heroCharacterInitial: document.querySelector("#heroCharacterInitial"),
  heroCharacterName: document.querySelector("#heroCharacterName"),
  heroCharacterTagline: document.querySelector("#heroCharacterTagline"),
  heroPowerName: document.querySelector("#heroPowerName"),
  heroPowerDescription: document.querySelector("#heroPowerDescription"),
  heroPowerRule: document.querySelector("#heroPowerRule"),
  heroPowerNote: document.querySelector("#heroPowerNote"),
  rosterStatusText: document.querySelector("#rosterStatusText"),
  onlineLobbyBar: document.querySelector("#onlineLobbyBar"),
  activeRoomCode: document.querySelector("#activeRoomCode"),
  copyRoomCode: document.querySelector("#copyRoomCodeButton"),
  lobbyPlayers: document.querySelector("#lobbyPlayers"),
  lobbyMessage: document.querySelector("#lobbyMessage"),
  ready: document.querySelector("#readyButton"),
  rematch: document.querySelector("#rematchButton"),
  changeMatch: document.querySelector("#changeMatchButton"),
  quit: document.querySelector("#quitButton"),
  rules: document.querySelector("#rulesButton"),
  rulesModal: document.querySelector("#rulesModal"),
  closeRules: document.querySelector("#closeRulesButton"),
  rivals: document.querySelector("#rivals"),
  actionFan: document.querySelector("#actionFan"),
  hearts: document.querySelector("#playerHearts"),
  ammoPill: document.querySelector("#ammoPill"),
  ammoCount: document.querySelector("#ammoCount"),
  ammoLabel: document.querySelector("#ammoLabel"),
  playerAvatarImage: document.querySelector("#playerAvatarImage"),
  playerAvatarInitial: document.querySelector("#playerAvatarInitial"),
  playerName: document.querySelector("#playerName"),
  phase: document.querySelector("#phaseLabel"),
  beatNumber: document.querySelector("#beatNumber"),
  beatProgress: document.querySelector("#beatProgress"),
  eventBanner: document.querySelector("#eventBanner"),
  reveals: document.querySelector("#reveals"),
  countdownOverlay: document.querySelector("#countdownOverlay"),
  countdownLabel: document.querySelector("#countdownLabel"),
  countdownNumber: document.querySelector("#countdownNumber"),
  territoryLeft: document.querySelector("#territoryLeft"),
  territoryRight: document.querySelector("#territoryRight"),
  resultBurst: document.querySelector("#resultBurst"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  winnerMedallion: document.querySelector("#winnerMedallion"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSubtitle: document.querySelector("#resultSubtitle"),
  statBeats: document.querySelector("#statBeats"),
  statBlocks: document.querySelector("#statBlocks"),
  statReloads: document.querySelector("#statReloads"),
};

const config = {
  mode: "local",
  playerCount: 2,
  onlinePlayerCount: 2,
  difficulty: "medium",
  characterId: "quickdraw",
  handedness:
    localStorage.getItem("quickDrawHandedness") === "left" ? "left" : "right",
};
const multiplayer = {
  socket: null,
  roomCode: null,
  room: null,
  playerId: getOrCreatePlayerId(),
  playerName: "",
  closing: false,
  initialCharacterSent: false,
};
let previewCharacterId = config.characterId;
let fighters = [];
let beat = 0;
let phase = "idle";
let selectedAction = null;
let robotSelections = new Map();
let targetingPower = false;
let deadline = 0;
let deadlineDuration = DECIDE_MS;
let timerFrame = null;
let phaseTimer = null;
let matchToken = 0;
let pausedFromPhase = null;
let stats = freshStats();
let tutorialStep = 0;
let tutorialAmmo = 0;
let tutorialRivalHeartCount = 3;
let tutorialPowerUsed = false;
let tutorialSpeedRunning = false;
let tutorialSpeedSelection = null;
let tutorialSpeedTimer = null;

ui.onlinePlayerName.value = localStorage.getItem("quickDrawPlayerName") || "";
applyHandedness();

ui.openDuelSetup.addEventListener("click", () => {
  ui.setupCard.hidden = false;
});
ui.closeSetup.addEventListener("click", () => {
  ui.setupCard.hidden = true;
});
ui.openSettings.addEventListener("click", () => {
  ui.settingsModal.hidden = false;
});
ui.closeSettings.addEventListener("click", () => {
  ui.settingsModal.hidden = true;
});
ui.settingsModal.addEventListener("click", (event) => {
  if (event.target === ui.settingsModal) ui.settingsModal.hidden = true;
});
ui.handedness.addEventListener("click", () => {
  config.handedness = config.handedness === "right" ? "left" : "right";
  localStorage.setItem("quickDrawHandedness", config.handedness);
  applyHandedness();
});
ui.openTutorial.addEventListener("click", openTutorial);
ui.exitTutorial.addEventListener("click", closeTutorial);
ui.tutorialCoachButton.addEventListener("click", handleTutorialCoachButton);
ui.tutorialActions.forEach((button) => {
  button.addEventListener("click", () => {
    handleTutorialAction(button.dataset.tutorialAction);
  });
});
document.addEventListener("keydown", (event) => {
  if (!ui.tutorial.classList.contains("is-active")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeTutorial();
  }
});

document.querySelectorAll("[data-game-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    config.mode = button.dataset.gameMode;
    selectSegment("[data-game-mode]", button);
    ui.localSetup.hidden = config.mode !== "local";
    ui.onlineSetup.hidden = config.mode !== "online";
    setOnlineStatus("");
  });
});

document.querySelectorAll("[data-player-count]").forEach((button) => {
  button.addEventListener("click", () => {
    config.playerCount = Number(button.dataset.playerCount);
    selectSegment("[data-player-count]", button);
  });
});

document.querySelectorAll("[data-online-player-count]").forEach((button) => {
  button.addEventListener("click", () => {
    config.onlinePlayerCount = Number(button.dataset.onlinePlayerCount);
    selectSegment("[data-online-player-count]", button);
  });
});

document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => {
    config.difficulty = button.dataset.difficulty;
    selectSegment("[data-difficulty]", button);
  });
});

ui.start.addEventListener("click", openCharacterSelect);
ui.createRoom.addEventListener("click", createOnlineRoom);
ui.joinRoom.addEventListener("click", joinOnlineRoom);
ui.joinRoomCode.addEventListener("input", () => {
  ui.joinRoomCode.value = normalizeRoomCode(ui.joinRoomCode.value);
});
ui.joinRoomCode.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinOnlineRoom();
});
ui.onlinePlayerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createOnlineRoom();
});
ui.backToHome.addEventListener("click", showHome);
ui.ready.addEventListener("click", confirmCharacter);
ui.copyRoomCode.addEventListener("click", copyActiveRoomCode);
ui.rematch.addEventListener("click", startMatch);
ui.changeMatch.addEventListener("click", showHome);
ui.quit.addEventListener("click", showHome);
ui.rules.addEventListener("click", openRules);
ui.closeRules.addEventListener("click", closeRules);
ui.rulesModal.addEventListener("click", (event) => {
  if (event.target === ui.rulesModal) closeRules();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase !== "idle" && phase !== "gameover") {
    pauseMatch();
  } else if (!document.hidden && phase === "paused" && ui.rulesModal.hidden) {
    resumePausedMatch();
  }
});

async function createOnlineRoom() {
  const playerName = readPlayerName();
  if (!playerName) return;
  setOnlineBusy(true);
  setOnlineStatus("Creating room…");

  try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: config.onlinePlayerCount }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not create the room.");
    await connectOnlineRoom(body.roomCode, playerName);
  } catch (error) {
    setOnlineStatus(error.message || "Could not create the room.", true);
  } finally {
    setOnlineBusy(false);
  }
}

async function joinOnlineRoom() {
  const playerName = readPlayerName();
  if (!playerName) return;
  const roomCode = normalizeRoomCode(ui.joinRoomCode.value);
  if (roomCode.length !== 6) {
    setOnlineStatus("Enter the six-character room code.", true);
    ui.joinRoomCode.focus();
    return;
  }

  setOnlineBusy(true);
  setOnlineStatus("Finding room…");
  try {
    const response = await fetch(`/api/rooms/${roomCode}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Room not found.");
    await connectOnlineRoom(roomCode, playerName);
  } catch (error) {
    setOnlineStatus(error.message || "Could not join the room.", true);
  } finally {
    setOnlineBusy(false);
  }
}

function connectOnlineRoom(roomCode, playerName) {
  disconnectOnlineRoom();
  multiplayer.roomCode = roomCode;
  multiplayer.playerName = playerName;
  multiplayer.closing = false;
  multiplayer.initialCharacterSent = false;
  ui.activeRoomCode.textContent = roomCode;
  localStorage.setItem("quickDrawPlayerName", playerName);

  const socketUrl = new URL(`/ws/rooms/${roomCode}`, window.location.href);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.searchParams.set("playerId", multiplayer.playerId);
  socketUrl.searchParams.set("name", playerName);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    multiplayer.socket = socket;
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("The room connection timed out."));
    }, 6000);

    socket.addEventListener("open", () => {
      window.clearTimeout(timeout);
      previewCharacterId = config.characterId;
      renderCharacterSelect();
      renderOnlineLobby();
      showScreen(ui.character);
      setOnlineStatus("");
      resolve();
    });

    socket.addEventListener("message", handleOnlineMessage);
    socket.addEventListener("error", () => {
      window.clearTimeout(timeout);
      if (multiplayer.room) {
        ui.lobbyMessage.textContent = "Connection interrupted";
      } else {
        reject(new Error("Could not connect. The room may be full."));
      }
    });
    socket.addEventListener("close", () => {
      window.clearTimeout(timeout);
      if (multiplayer.socket === socket) multiplayer.socket = null;
      if (!multiplayer.closing && multiplayer.room) {
        ui.lobbyMessage.textContent = "Disconnected · return home to reconnect";
        ui.ready.disabled = true;
      }
    });
  });
}

function handleOnlineMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (message.type === "error") {
    ui.lobbyMessage.textContent = message.error;
    return;
  }
  if (message.type !== "room_state") return;

  multiplayer.room = message.room;
  const player = onlinePlayer();
  if (player?.characterId) {
    config.characterId = player.characterId;
    previewCharacterId = player.characterId;
  } else if (player && !multiplayer.initialCharacterSent) {
    const available = firstAvailableOnlineCharacter();
    previewCharacterId = available.id;
    config.characterId = available.id;
    multiplayer.initialCharacterSent = true;
    sendOnline({
      type: "player_update",
      name: multiplayer.playerName,
      characterId: available.id,
    });
  }

  renderOnlineLobby();
  renderCharacterSelect();
}

function sendOnline(message) {
  if (multiplayer.socket?.readyState !== WebSocket.OPEN) return false;
  multiplayer.socket.send(JSON.stringify(message));
  return true;
}

function disconnectOnlineRoom() {
  const socket = multiplayer.socket;
  multiplayer.closing = true;
  multiplayer.socket = null;
  multiplayer.room = null;
  multiplayer.roomCode = null;
  multiplayer.initialCharacterSent = false;
  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close(1000, "Left room");
  }
}

function readPlayerName() {
  const playerName = ui.onlinePlayerName.value.trim().slice(0, 24);
  if (!playerName) {
    setOnlineStatus("Enter your player name first.", true);
    ui.onlinePlayerName.focus();
    return null;
  }
  return playerName;
}

function setOnlineBusy(busy) {
  ui.createRoom.disabled = busy;
  ui.joinRoom.disabled = busy;
  ui.onlinePlayerName.disabled = busy;
  ui.joinRoomCode.disabled = busy;
}

function setOnlineStatus(message, isError = false) {
  ui.onlineStatus.textContent = message;
  ui.onlineStatus.classList.toggle("is-error", isError);
}

function normalizeRoomCode(value) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function getOrCreatePlayerId() {
  const stored = sessionStorage.getItem("quickDrawPlayerId");
  if (stored) return stored;
  const playerId = crypto.randomUUID();
  sessionStorage.setItem("quickDrawPlayerId", playerId);
  return playerId;
}

function freshStats() {
  return { beats: 0, blocks: 0, reloads: 0, riskyReloads: 0 };
}

function applyHandedness() {
  const isLeftHanded = config.handedness === "left";
  ui.combat.dataset.handedness = config.handedness;
  ui.tutorial.dataset.handedness = config.handedness;
  ui.handedness.textContent = isLeftHanded ? "LEFT-HANDED" : "RIGHT-HANDED";
  ui.handedness.setAttribute("aria-pressed", String(isLeftHanded));
  if (fighters.length) renderTerritories();
}

function openTutorial() {
  ui.setupCard.hidden = true;
  ui.settingsModal.hidden = true;
  stopTutorialSpeedRound();
  tutorialStep = 0;
  tutorialAmmo = 0;
  tutorialRivalHeartCount = 3;
  tutorialPowerUsed = false;
  tutorialSpeedSelection = null;
  showScreen(ui.tutorial);
  renderTutorial();
  ui.tutorialCoachButton.focus();
}

function closeTutorial() {
  stopTutorialSpeedRound();
  showHome();
  ui.openTutorial.focus();
}

function finishTutorial() {
  stopTutorialSpeedRound();
  showHome();
  ui.setupCard.hidden = false;
  ui.closeSetup.focus();
}

function renderTutorial() {
  const step = TUTORIAL_STEPS[tutorialStep];
  const expectedAction = ["block", "reload", "fire", "power"].includes(
    step.expected,
  )
    ? step.expected
    : null;

  ui.tutorialStepLabel.textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1
      ? "TRAINING COMPLETE"
      : `TRAINING ${tutorialStep + 1} OF 6`;
  ui.tutorialPhaseLabel.textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1 ? "READY" : "PAUSED";
  ui.tutorialCoachEyebrow.textContent = step.eyebrow;
  ui.tutorialCoachTitle.textContent = step.title;
  ui.tutorialCoachBody.textContent = step.body;
  ui.tutorialEventBanner.textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1 && tutorialSpeedSelection
      ? `${tutorialActionName(tutorialSpeedSelection)} locked in on time`
      : step.event;
  ui.tutorialCoachButton.hidden = !step.button;
  if (step.button) ui.tutorialCoachButton.textContent = step.button;
  ui.tutorialCoach.classList.remove("is-speed-round");

  ui.tutorialActions.forEach((button) => {
    const action = button.dataset.tutorialAction;
    const isExpected = action === expectedAction;
    button.disabled = !isExpected;
    button.classList.toggle("is-tutorial-target", isExpected);
    button.classList.remove("is-selected");
    button.classList.toggle(
      "is-tutorial-used",
      action === "power" && tutorialPowerUsed,
    );
  });

  ui.tutorialAmmoCount.textContent = String(tutorialAmmo);
  renderTutorialHearts(ui.tutorialRivalHearts, tutorialRivalHeartCount);
  renderTutorialHearts(ui.tutorialPlayerHearts, 3);
  resetTutorialBeatProgress();
}

function handleTutorialCoachButton() {
  const expected = TUTORIAL_STEPS[tutorialStep].expected;
  if (expected === "intro") {
    tutorialStep = 1;
    renderTutorial();
    focusTutorialTarget();
  } else if (expected === "speed") {
    startTutorialSpeedRound();
  } else if (expected === "finish") {
    finishTutorial();
  }
}

function handleTutorialAction(action) {
  if (tutorialSpeedRunning) {
    if (action === "power" && tutorialPowerUsed) return;
    tutorialSpeedSelection = action;
    ui.tutorialEventBanner.textContent = `${tutorialActionName(action)} locked`;
    ui.tutorialActions.forEach((button) => {
      button.disabled = true;
      button.classList.toggle(
        "is-selected",
        button.dataset.tutorialAction === action,
      );
      button.classList.remove("is-tutorial-target");
    });
    return;
  }

  if (action !== TUTORIAL_STEPS[tutorialStep].expected) return;
  if (action === "reload") {
    tutorialAmmo = 1;
    tutorialStep = 2;
  } else if (action === "fire") {
    tutorialAmmo = 0;
    tutorialRivalHeartCount = 2;
    tutorialStep = 3;
  } else if (action === "block") {
    tutorialStep = 4;
  } else if (action === "power") {
    tutorialPowerUsed = true;
    tutorialRivalHeartCount = 1;
    tutorialAmmo = 1;
    tutorialStep = 5;
  }
  renderTutorial();
  focusTutorialTarget();
}

function startTutorialSpeedRound() {
  stopTutorialSpeedRound();
  tutorialSpeedRunning = true;
  tutorialSpeedSelection = null;
  ui.tutorialPhaseLabel.textContent = "PICK!";
  ui.tutorialCoachEyebrow.textContent = "LIVE BEAT · 1 SECOND";
  ui.tutorialCoachTitle.textContent = "DRAW!";
  ui.tutorialCoachBody.textContent =
    "Choose BLOCK, RELOAD, or FIRE before the one-second gold bar empties.";
  ui.tutorialCoachButton.hidden = true;
  ui.tutorialCoach.classList.add("is-speed-round");
  ui.tutorialEventBanner.textContent = "Choose a move now";
  ui.tutorialActions.forEach((button) => {
    const unavailable =
      button.dataset.tutorialAction === "power" && tutorialPowerUsed;
    button.disabled = unavailable;
    button.classList.toggle("is-tutorial-target", !unavailable);
    button.classList.remove("is-selected");
  });

  ui.tutorialBeatProgress.style.transition = "none";
  ui.tutorialBeatProgress.style.transform = "scaleX(1)";
  requestAnimationFrame(() => {
    if (!tutorialSpeedRunning) return;
    requestAnimationFrame(() => {
      if (!tutorialSpeedRunning) return;
      ui.tutorialBeatProgress.style.transition = "transform 1000ms linear";
      ui.tutorialBeatProgress.style.transform = "scaleX(0)";
    });
  });
  tutorialSpeedTimer = window.setTimeout(finishTutorialSpeedRound, 1000);
}

function finishTutorialSpeedRound() {
  window.clearTimeout(tutorialSpeedTimer);
  tutorialSpeedTimer = null;
  tutorialSpeedRunning = false;

  if (!tutorialSpeedSelection) {
    ui.tutorialPhaseLabel.textContent = "TIME!";
    ui.tutorialCoachEyebrow.textContent = "THE CLOCK IS FAST";
    ui.tutorialCoachTitle.textContent = "TIME'S UP—TRY AGAIN";
    ui.tutorialCoachBody.textContent =
      "That is the real pace. The tutorial stays paused here, so start the beat again when you are ready.";
    ui.tutorialCoachButton.hidden = false;
    ui.tutorialCoachButton.textContent = "TRY 1-SECOND BEAT AGAIN";
    ui.tutorialCoach.classList.remove("is-speed-round");
    ui.tutorialEventBanner.textContent = "No move selected";
    ui.tutorialActions.forEach((button) => {
      button.disabled = true;
      button.classList.remove("is-tutorial-target", "is-selected");
    });
    resetTutorialBeatProgress();
    return;
  }

  tutorialStep = 6;
  renderTutorial();
  ui.tutorialCoachButton.focus();
}

function stopTutorialSpeedRound() {
  window.clearTimeout(tutorialSpeedTimer);
  tutorialSpeedTimer = null;
  tutorialSpeedRunning = false;
  resetTutorialBeatProgress();
}

function resetTutorialBeatProgress() {
  if (!ui.tutorialBeatProgress) return;
  ui.tutorialBeatProgress.style.transition = "none";
  ui.tutorialBeatProgress.style.transform = "scaleX(1)";
}

function renderTutorialHearts(container, count) {
  container.querySelectorAll(".heart").forEach((heart, index) => {
    heart.classList.toggle("is-empty", index >= count);
  });
}

function focusTutorialTarget() {
  const expected = TUTORIAL_STEPS[tutorialStep].expected;
  const button = ui.tutorialActions.find(
    (item) => item.dataset.tutorialAction === expected,
  );
  if (button) requestAnimationFrame(() => button.focus());
}

function tutorialActionName(action) {
  return {
    block: "BLOCK",
    reload: "RELOAD",
    fire: "FIRE",
    power: "POWER",
  }[action] ?? "MOVE";
}

function selectSegment(selector, selected) {
  document.querySelectorAll(selector).forEach((button) => {
    const active = button === selected;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function startMatch() {
  clearTimers();
  matchToken += 1;
  const selectedCharacter = characterById(config.characterId);
  const matchRoster = [
    selectedCharacter,
    ...CHARACTERS.filter((character) => character.id !== selectedCharacter.id),
  ];
  matchRoster.forEach(preloadActionImages);
  fighters = [
    createFighter({
      id: "you",
      name: "You",
      color: selectedCharacter.color,
      avatar: selectedCharacter.initial,
      isHuman: true,
      characterId: selectedCharacter.id,
      characterName: selectedCharacter.name,
      image: selectedCharacter.image ?? null,
      actionImages: selectedCharacter.actionImages ?? null,
    }),
    createFighter({
      id: "mo",
      name: "Mo",
      color: "#cf7b2a",
      avatar: matchRoster[1].initial,
      characterId: matchRoster[1].id,
      characterName: matchRoster[1].name,
      image: matchRoster[1].image ?? null,
      actionImages: matchRoster[1].actionImages ?? null,
    }),
  ];
  if (config.playerCount === 3) {
    fighters.push(
      createFighter({
        id: "ava",
        name: "Ava",
        color: "#9b54c6",
        avatar: matchRoster[2].initial,
        characterId: matchRoster[2].id,
        characterName: matchRoster[2].name,
        image: matchRoster[2].image ?? null,
        actionImages: matchRoster[2].actionImages ?? null,
      }),
    );
  }

  beat = 0;
  stats = freshStats();
  phase = "starting";
  pausedFromPhase = null;
  selectedAction = null;
  robotSelections = new Map();
  ui.combat.dataset.layout =
    config.playerCount === 2 ? "duel-thumb" : "three-target";
  ui.rules.disabled = true;
  ui.countdownOverlay.hidden = true;
  showScreen(ui.combat);
  renderAll();
  phaseTimer = window.setTimeout(() => startCountdown(matchToken), 180);
}

function preloadActionImages(character) {
  Object.values(character.actionImages ?? {}).forEach((source) => {
    const image = new Image();
    image.src = source;
  });
}

function openCharacterSelect() {
  config.mode = "local";
  previewCharacterId = config.characterId;
  renderCharacterSelect();
  showScreen(ui.character);
}

function confirmCharacter() {
  const character = characterById(previewCharacterId);
  if (!character.available) return;
  config.characterId = character.id;

  if (config.mode === "online") {
    const player = onlinePlayer();
    if (!player) return;
    sendOnline({
      type: "player_update",
      name: multiplayer.playerName,
      characterId: character.id,
    });
    sendOnline({ type: "ready", ready: !player.ready });
    return;
  }

  startMatch();
}

function renderCharacterSelect() {
  const selected = characterById(previewCharacterId);
  const claimedByOthers = new Set(
    config.mode === "online"
      ? (multiplayer.room?.players ?? [])
          .filter((player) => player.id !== multiplayer.playerId)
          .map((player) => player.characterId)
          .filter(Boolean)
      : [],
  );
  ui.characterGrid.replaceChildren(
    ...CHARACTERS.map((character) => {
      const isTaken = claimedByOthers.has(character.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "character-card",
        character.id === selected.id ? "is-selected" : "",
        character.available ? "" : "is-coming",
        isTaken ? "is-taken" : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.dataset.characterId = character.id;
      button.disabled = isTaken || !character.available;
      button.style.setProperty("--character-color", character.color);
      button.setAttribute("aria-pressed", String(character.id === selected.id));
      button.setAttribute(
        "aria-label",
        `${character.name}, ${character.powerName}`,
      );
      button.innerHTML = `
        <span class="wanted-label" aria-hidden="true">WANTED</span>
        ${
          character.image
            ? `<img src="${character.image}" alt="" />`
            : `<span class="roster-placeholder" aria-hidden="true">${character.initial}</span>`
        }
        <span class="character-card-copy">
          <strong>${character.name}</strong>
          <span>${character.powerName}</span>
        </span>
      `;
      button.addEventListener("click", () => {
        previewCharacterId = character.id;
        config.characterId = character.id;
        if (config.mode === "online") {
          sendOnline({
            type: "player_update",
            name: multiplayer.playerName,
            characterId: character.id,
          });
        }
        renderCharacterSelect();
      });
      return button;
    }),
    ...Array.from(
      { length: Math.max(0, ROSTER_SLOT_COUNT - CHARACTERS.length) },
      (_, index) => {
        const slotNumber = CHARACTERS.length + index + 1;
        const slot = document.createElement("div");
        slot.className = "character-card is-coming is-future";
        slot.setAttribute("aria-label", `Future fighter slot ${slotNumber}`);
        slot.innerHTML = `
          <span class="wanted-label" aria-hidden="true">WANTED</span>
          <span class="roster-placeholder" aria-hidden="true">?</span>
          <span class="character-card-copy">
            <strong>UNKNOWN</strong>
            <span>COMING SOON</span>
          </span>
        `;
        return slot;
      },
    ),
  );

  ui.characterFeature.style.setProperty("--character-color", selected.color);
  ui.characterFeature.dataset.characterId = selected.id;
  ui.characterGlow.style.setProperty("--character-color", selected.color);
  ui.heroCharacterName.textContent = selected.name;
  ui.heroCharacterTagline.textContent = selected.tagline;
  ui.heroPowerName.textContent = selected.powerName;
  ui.heroPowerDescription.textContent = selected.powerDescription;
  ui.heroPowerRule.textContent =
    selected.id === "civilian"
      ? "SPECIAL · REPEATABLE TO 5"
      : "SPECIAL · ONCE PER DUEL";
  ui.heroPowerNote.textContent =
    selected.id === "civilian"
      ? "Reach five uses and survive the fifth beat to win."
      : "Every gunslinger’s special can be used once per duel.";
  const heroImage = selected.fullBodyImage ?? selected.image;
  if (heroImage) {
    ui.heroCharacterImage.src = heroImage;
    ui.heroCharacterImage.alt = selected.fullBodyImage
      ? `${selected.name} full-body character`
      : `${selected.name} portrait`;
    ui.heroCharacterImage.hidden = false;
    ui.comingSoonHero.hidden = true;
  } else {
    ui.heroCharacterImage.removeAttribute("src");
    ui.heroCharacterImage.alt = "";
    ui.heroCharacterImage.hidden = true;
    ui.comingSoonHero.hidden = false;
    ui.heroCharacterInitial.textContent = selected.initial;
  }
  const player = onlinePlayer();
  const onlineDisconnected =
    config.mode === "online" &&
    multiplayer.socket?.readyState !== WebSocket.OPEN;
  ui.ready.disabled =
    !selected.available || claimedByOthers.has(selected.id) || onlineDisconnected;
  ui.ready.textContent =
    config.mode === "online"
      ? player?.ready
        ? "READY ✓ · TAP TO CANCEL"
        : "READY UP"
      : selected.available
        ? "LOCK IN"
        : "ART COMING SOON";
  ui.onlineLobbyBar.hidden = config.mode !== "online";
  ui.rosterStatusText.textContent =
    config.mode === "online"
      ? `${multiplayer.room?.playerCount ?? 0}/${multiplayer.room?.maxPlayers ?? config.onlinePlayerCount} players`
      : `${CHARACTERS.filter((character) => character.available).length} of ${ROSTER_SLOT_COUNT} fighters ready`;
}

function renderOnlineLobby() {
  const room = multiplayer.room;
  ui.onlineLobbyBar.hidden = config.mode !== "online";
  if (!room) {
    ui.lobbyPlayers.replaceChildren();
    ui.lobbyMessage.textContent = "Connecting…";
    return;
  }

  ui.activeRoomCode.textContent = room.code;
  const slots = Array.from({ length: room.maxPlayers }, (_, index) => room.players[index] ?? null);
  ui.lobbyPlayers.replaceChildren(
    ...slots.map((player) => {
      const item = document.createElement("div");
      item.className = `lobby-player ${player?.ready ? "is-ready" : ""}`;
      const dot = document.createElement("span");
      dot.className = "lobby-player-dot";
      const name = document.createElement("strong");
      name.textContent = player
        ? `${player.name}${player.id === multiplayer.playerId ? " (YOU)" : ""}${player.isHost ? " ★" : ""}`
        : "OPEN SLOT";
      const fighter = document.createElement("span");
      fighter.textContent = player
        ? player.characterId
          ? `${characterById(player.characterId).shortName} · ${player.ready ? "READY" : "CHOOSING"}`
          : "CHOOSING FIGHTER"
        : "WAITING TO JOIN";
      item.append(dot, name, fighter);
      return item;
    }),
  );

  if (room.canStart) {
    ui.lobbyMessage.textContent = "ALL READY · BATTLE SYNC IS NEXT";
  } else if (room.playerCount < room.maxPlayers) {
    const openSlots = room.maxPlayers - room.playerCount;
    ui.lobbyMessage.textContent = `Waiting for ${openSlots} player${openSlots === 1 ? "" : "s"}…`;
  } else {
    const readyCount = room.players.filter((player) => player.ready).length;
    ui.lobbyMessage.textContent = `${readyCount}/${room.maxPlayers} ready`;
  }
}

function onlinePlayer() {
  return multiplayer.room?.players.find((player) => player.id === multiplayer.playerId) ?? null;
}

function firstAvailableOnlineCharacter() {
  const claimed = new Set(
    (multiplayer.room?.players ?? [])
      .filter((player) => player.id !== multiplayer.playerId)
      .map((player) => player.characterId)
      .filter(Boolean),
  );
  return CHARACTERS.find((character) => character.available && !claimed.has(character.id)) ?? CHARACTERS[0];
}

async function copyActiveRoomCode() {
  if (!multiplayer.roomCode) return;
  try {
    await navigator.clipboard.writeText(multiplayer.roomCode);
    ui.copyRoomCode.textContent = "COPIED";
    window.setTimeout(() => {
      ui.copyRoomCode.textContent = "COPY";
    }, 1200);
  } catch {
    ui.lobbyMessage.textContent = `Share code ${multiplayer.roomCode}`;
  }
}

function startCountdown(token) {
  if (token !== matchToken || phase === "gameover" || phase === "idle") return;
  phase = "countdown";
  pausedFromPhase = null;
  ui.rules.disabled = true;
  ui.beatNumber.textContent = "MATCH START";
  ui.phase.textContent = "GET READY";
  ui.eventBanner.textContent = "First beat begins after the count";
  ui.reveals.replaceChildren();
  ui.reveals.classList.remove("is-outcome");
  ui.combat.classList.remove("phase-decide", "phase-resolve", "impact");
  ui.combat.classList.add("phase-countdown");
  ui.countdownOverlay.hidden = false;
  ui.eventBanner.hidden = false;
  renderActionFan();

  let count = 3;
  const showNextNumber = () => {
    if (token !== matchToken || phase !== "countdown") return;
    ui.countdownLabel.textContent = count === 1 ? "READY…" : "GET READY";
    ui.countdownNumber.textContent = String(count);
    ui.countdownNumber.animate?.(
      [
        { opacity: 0, transform: "scale(1.7) rotate(-5deg)" },
        { opacity: 1, transform: "scale(1) rotate(0deg)", offset: 0.28 },
        { opacity: 1, transform: "scale(1)", offset: 0.76 },
        { opacity: 0.25, transform: "scale(0.82)" },
      ],
      { duration: 920, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    pulseDevice(22);

    phaseTimer = window.setTimeout(() => {
      count -= 1;
      if (count > 0) {
        showNextNumber();
      } else {
        ui.countdownOverlay.hidden = true;
        startBeat(token);
      }
    }, 1000);
  };

  showNextNumber();
}

function startBeat(token) {
  if (token !== matchToken || phase === "gameover") return;
  const survivors = fighters.filter((fighter) => fighter.alive);
  if (survivors.length === 1) {
    endMatch(survivors[0]);
    return;
  }
  const player = getPlayer();

  beat += 1;
  stats.beats = beat;
  phase = "decide";
  selectedAction = null;
  targetingPower = false;
  robotSelections = new Map();

  for (const robot of fighters.filter((fighter) => fighter.alive && !fighter.isHuman)) {
    robotSelections.set(robot.id, chooseRobotAction(robot, fighters, config.difficulty));
  }

  ui.beatNumber.textContent = `BEAT ${beat}`;
  ui.phase.textContent = !player.alive ? "SPECTATING" : "PICK!";
  ui.eventBanner.textContent = !player.alive
    ? "You’re out — last robot standing wins"
    : "Choose your move";
  ui.eventBanner.hidden = false;
  ui.reveals.replaceChildren();
  ui.reveals.classList.remove("is-outcome");
  ui.combat.classList.remove("phase-countdown", "phase-resolve", "impact");
  ui.combat.classList.add("phase-decide");
  ui.rules.disabled = false;
  renderAll();
  pulseDevice(18);

  deadlineDuration = DECIDE_MS;
  deadline = performance.now() + deadlineDuration;
  animateTimer();
  phaseTimer = window.setTimeout(() => beginReveal(token), DECIDE_MS);
}

function beginReveal(token) {
  if (token !== matchToken || (phase !== "decide" && phase !== "freeze")) return;
  const player = getPlayer();
  const selectedPower = selectedAction?.type === ACTIONS.POWER
    ? powerIdFor(player)
    : null;
  if (
    phase === "decide" &&
    selectedPower === POWER_IDS.TIME_FREEZE &&
    !player.powerUsed
  ) {
    beginTimeFreeze(token);
    return;
  }

  cancelAnimationFrame(timerFrame);
  phase = "reveal";
  ui.rules.disabled = true;
  ui.phase.textContent = "REVEAL";
  ui.eventBanner.hidden = false;
  ui.beatProgress.style.transform = "scaleX(0)";
  ui.combat.classList.remove("phase-decide");
  ui.combat.classList.add("phase-resolve");

  const selections = new Map(robotSelections);
  if (player.alive) {
    selections.set(player.id, selectedAction ?? { type: ACTIONS.WAIT });
  }
  renderActionFan();
  renderReveals(selections);
  ui.eventBanner.textContent = describeReveal(selections);
  pulseDevice([18, 28]);

  phaseTimer = window.setTimeout(() => finishBeat(token, selections), REVEAL_MS);
}

function beginTimeFreeze(token) {
  const player = getPlayer();
  const livingFighters = fighters.filter((fighter) => fighter.alive);
  const incomingShots = [...robotSelections].filter(([fighterId, action]) => {
    const fighter = fighterById(fighterId);
    return fighter && actionThreatensPlayer(action, fighter, player);
  });
  player.powerUsed = true;
  phase = "freeze";
  selectedAction = null;
  targetingPower = false;
  ui.phase.textContent = "TIME FROZEN";
  ui.eventBanner.hidden = false;
  ui.eventBanner.textContent =
    livingFighters.length > 2
      ? incomingShots.length > 0
        ? `${incomingShots.length} ${incomingShots.length === 1 ? "shot is" : "shots are"} aimed at you — choose your answer`
        : "No shots are aimed at you — choose your answer"
      : "Their moves are frozen — choose your answer";
  ui.reveals.replaceChildren();
  renderReveals(robotSelections);
  deadlineDuration = 4000;
  deadline = performance.now() + deadlineDuration;
  renderAll();
  animateTimer();
  phaseTimer = window.setTimeout(() => beginReveal(token), deadlineDuration);
}

function finishBeat(token, selections) {
  if (token !== matchToken || phase !== "reveal") return;
  phase = "outcome";
  ui.rules.disabled = true;
  const player = getPlayer();
  const result = resolveTurn(fighters, selections);
  const shotsBlocked = result.blockedShots.get(player.id) ?? 0;
  stats.blocks += shotsBlocked;
  if (result.reloaded.has(player.id)) stats.reloads += 1;
  if (result.reloaded.has(player.id) && result.damage.has(player.id)) stats.riskyReloads += 1;

  ui.phase.textContent = "OUTCOME";
  ui.eventBanner.textContent = describeOutcome(result.events);
  ui.eventBanner.hidden = true;
  ui.combat.classList.add("impact");
  renderAll();
  renderOutcomeActions(result);
  animateEvents(result.events);
  pulseDevice(result.damage.size ? [25, 35, 45] : 14);

  phaseTimer = window.setTimeout(() => {
    const civilianVictory = result.events.find(
      (event) => event.type === "civilianVictory",
    );
    if (civilianVictory) {
      endMatch(fighterById(civilianVictory.actorId), "civilian-goal");
      return;
    }
    const alive = fighters.filter((fighter) => fighter.alive);
    if (alive.length === 1) {
      endMatch(alive[0]);
    } else {
      startBeat(token);
    }
  }, OUTCOME_MS);
}

function chooseAction(action) {
  if (
    (phase !== "decide" && phase !== "freeze") ||
    !getPlayer().alive ||
    action.disabled
  ) return;
  const player = getPlayer();
  const powerId = powerIdFor(player);
  const livingRivals = fighters.filter(
    (fighter) => fighter.alive && !fighter.isHuman,
  );

  if (
    phase === "decide" &&
    action.type === ACTIONS.POWER &&
    powerNeedsTarget(powerId) &&
    !action.targetId &&
    livingRivals.length > 1
  ) {
    selectedAction = null;
    targetingPower = !targetingPower;
    ui.eventBanner.textContent = targetingPower
      ? `Tap the outlaw to use ${powerNameFor(player)}`
      : "Choose your move";
    renderAll();
    return;
  }

  targetingPower = false;
  selectedAction = { type: action.type, targetId: action.targetId };
  const target = action.targetId ? fighterById(action.targetId) : null;

  if (action.type === ACTIONS.POWER) {
    ui.eventBanner.textContent = target
      ? `${powerNameFor(player)} targets ${target.name}`
      : `${powerNameFor(player)} locked in`;
  } else {
    ui.eventBanner.textContent =
      action.type === ACTIONS.FIRE
        ? `Targeting ${target.name}`
        : `${actionLabel(action.type)} locked in`;
  }
  renderAll();

  if (phase === "freeze") {
    window.clearTimeout(phaseTimer);
    phaseTimer = window.setTimeout(() => beginReveal(matchToken), 120);
  }
}

function renderAll() {
  renderTerritories();
  renderRivals();
  renderPlayerHud();
  renderActionFan();
}

function renderRivals() {
  const rivals = fighters.filter((fighter) => !fighter.isHuman);
  const player = getPlayer();
  const playerPowerId = powerIdFor(player);
  const showTargetedPowerButtons =
    rivals.length > 1 && powerNeedsTarget(playerPowerId);
  ui.rivals.replaceChildren(
    ...rivals.map((fighter) => {
      const card = document.createElement("article");
      card.className = [
        "rival-card",
        fighter.alive ? "" : "is-out",
        targetingPower && fighter.alive ? "is-power-target" : "",
      ].filter(Boolean).join(" ");
      card.dataset.fighterId = fighter.id;
      card.dataset.characterId = fighter.characterId ?? "";
      card.style.setProperty("--fighter-color", fighter.color);
      card.innerHTML = `
        <div class="rival-avatar" aria-hidden="true">
          ${fighter.image ? `<img src="${fighter.image}" alt="" />` : fighter.avatar}
        </div>
        <div class="rival-copy">
          <strong>${fighter.name}</strong>
          <div class="rival-hearts">
            ${heartMarkup(fighter.hearts, heartSlotCount(fighter))}
            ${
              powerIdFor(fighter) === POWER_IDS.CIVILIAN
                ? `<span class="civilian-progress">${fighter.powerUses}/${CIVILIAN_POWER_GOAL}</span>`
                : ""
            }
          </div>
        </div>
      `;

      if (rivals.length > 1 && playerPowerId !== POWER_IDS.CIVILIAN) {
        const targetActions = document.createElement("div");
        targetActions.className = "rival-target-actions";

        const shoot = document.createElement("button");
        const isSelected =
          selectedAction?.type === ACTIONS.FIRE &&
          selectedAction.targetId === fighter.id;
        shoot.type = "button";
        shoot.className = [
          "rival-target-button",
          "rival-shoot-button",
          isSelected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        shoot.disabled =
          (phase !== "decide" && phase !== "freeze") ||
          !player?.alive ||
          !fighter.alive ||
          player.ammo < 1;
        shoot.setAttribute("aria-label", `Shoot ${fighter.name}`);
        shoot.setAttribute("aria-pressed", String(isSelected));
        shoot.innerHTML = `<span>✸</span><strong>SHOOT</strong>`;
        shoot.addEventListener("click", (event) => {
          event.stopPropagation();
          chooseAction({
            type: ACTIONS.FIRE,
            targetId: fighter.id,
            disabled: shoot.disabled,
          });
        });
        targetActions.append(shoot);

        if (showTargetedPowerButtons) {
          const powerAction = {
            type: ACTIONS.POWER,
            targetId: fighter.id,
          };
          const power = document.createElement("button");
          const isPowerSelected =
            selectedAction?.type === ACTIONS.POWER &&
            selectedAction.targetId === fighter.id;
          power.type = "button";
          power.className = [
            "rival-target-button",
            "rival-power-button",
            isPowerSelected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          power.disabled =
            (phase !== "decide" && phase !== "freeze") ||
            !player?.alive ||
            !fighter.alive ||
            phase === "freeze" ||
            !canUsePower(player, fighters, powerAction);
          power.setAttribute(
            "aria-label",
            `Use ${powerNameFor(player)} on ${fighter.name}`,
          );
          power.setAttribute("aria-pressed", String(isPowerSelected));
          power.innerHTML = `<span>★</span><strong>POWER</strong>`;
          power.addEventListener("click", (event) => {
            event.stopPropagation();
            chooseAction({
              ...powerAction,
              disabled: power.disabled,
            });
          });
          targetActions.append(power);
        }

        card.append(targetActions);
      }

      if (targetingPower && fighter.alive) {
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute(
          "aria-label",
          `Use ${powerNameFor(player)} on ${fighter.name}`,
        );
        const chooseTarget = () => chooseAction({
          type: ACTIONS.POWER,
          targetId: fighter.id,
          disabled: false,
        });
        card.addEventListener("click", chooseTarget);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            chooseTarget();
          }
        });
      }
      return card;
    }),
  );
}

function renderPlayerHud() {
  const player = getPlayer();
  const isCivilian = powerIdFor(player) === POWER_IDS.CIVILIAN;
  ui.combat.dataset.playerCharacterId = player.characterId ?? "";
  ui.hearts.innerHTML = heartMarkup(player.hearts, heartSlotCount(player));
  ui.ammoPill.classList.toggle("is-civilian-goal", isCivilian);
  ui.ammoPill.setAttribute(
    "aria-label",
    isCivilian
      ? `${player.powerUses} of ${CIVILIAN_POWER_GOAL} survival uses`
      : `${player.ammo} ${player.ammo === 1 ? "shot" : "shots"}`,
  );
  ui.ammoCount.textContent = isCivilian
    ? `${player.powerUses}/${CIVILIAN_POWER_GOAL}`
    : String(player.ammo);
  ui.ammoLabel.textContent = isCivilian
    ? "survived"
    : player.ammo === 1
      ? "shot"
      : "shots";
  ui.playerName.textContent =
    player.name === "You"
      ? player.characterName ?? "YOU"
      : player.name;
  if (player.image) {
    ui.playerAvatarImage.src = player.image;
    ui.playerAvatarImage.hidden = false;
  } else {
    ui.playerAvatarImage.removeAttribute("src");
    ui.playerAvatarImage.hidden = true;
    ui.playerAvatarInitial.textContent = player.avatar;
  }
}

function renderActionFan() {
  const player = getPlayer();
  if (!player) return;
  const rivals = fighters.filter((fighter) => !fighter.isHuman);
  const livingRivals = rivals.filter((fighter) => fighter.alive);
  const playerPowerId = powerIdFor(player);
  const powerTarget = powerNeedsTarget(playerPowerId) && livingRivals.length === 1
    ? livingRivals[0]
    : null;
  const powerAction = {
    type: ACTIONS.POWER,
    targetId: powerTarget?.id ?? null,
  };
  const hasOpponentTargetedPower =
    rivals.length > 1 && powerNeedsTarget(playerPowerId);
  const actions =
    playerPowerId === POWER_IDS.CIVILIAN
      ? [
          { type: ACTIONS.BLOCK },
          powerAction,
        ]
      : rivals.length === 1
      ? [
          { type: ACTIONS.RELOAD },
          { type: ACTIONS.FIRE, targetId: rivals[0].id },
          { type: ACTIONS.BLOCK },
          powerAction,
        ]
      : [
          { type: ACTIONS.BLOCK },
          { type: ACTIONS.RELOAD },
          ...(hasOpponentTargetedPower ? [] : [powerAction]),
        ];

  ui.actionFan.dataset.count = String(actions.length);
  ui.actionFan.replaceChildren(
    ...actions.map((action, index) => {
      const target = action.targetId ? fighterById(action.targetId) : null;
      const disabled =
        (phase !== "decide" && phase !== "freeze") ||
        !player.alive ||
        (Boolean(action.targetId) && !target?.alive) ||
        (action.type === ACTIONS.FIRE && (player.ammo < 1 || !target)) ||
        (phase === "freeze" && action.type === ACTIONS.POWER) ||
        (action.type === ACTIONS.POWER && !canUsePower(player, fighters, action));
      const selected =
        (selectedAction?.type === action.type &&
          (!action.targetId || selectedAction.targetId === action.targetId)
        ) || (action.type === ACTIONS.POWER && targetingPower);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "action-button",
        `action-${action.type}`,
        action.edge ? `edge-${action.edge}` : "",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.disabled = disabled;
      button.dataset.action = action.type;
      if (action.targetId) button.dataset.target = action.targetId;
      if (target) button.style.setProperty("--target-color", target.color);
      button.style.setProperty("--action-index", index);
      button.setAttribute(
        "aria-label",
        action.type === ACTIONS.FIRE
          ? `Fire at ${target?.name ?? "rival"}`
          : action.type === ACTIONS.POWER
            ? target
              ? `${powerNameFor(player)} on ${target.name}`
              : powerNameFor(player)
            : actionLabel(action.type),
      );
      button.innerHTML = `
        <span class="action-icon" aria-hidden="true">${actionIcon(action.type)}</span>
        <strong>${action.type === ACTIONS.FIRE ? "FIRE" : actionLabel(action.type)}</strong>
        <small>${actionButtonHint(action, player, target)}</small>
      `;
      button.addEventListener("click", () => chooseAction({ ...action, disabled }));
      return button;
    }),
  );
}

function renderReveals(selections) {
  ui.reveals.classList.remove("is-outcome");
  const active = fighters.filter(
    (fighter) => fighter.alive && (phase !== "freeze" || selections.has(fighter.id)),
  );
  const showTargets =
    phase === "freeze" && fighters.filter((fighter) => fighter.alive).length > 2;
  ui.reveals.replaceChildren(
    ...active.map((fighter) => {
      const action = selections.get(fighter.id) ?? { type: ACTIONS.WAIT };
      const target = showTargets ? freezeRevealTarget(action, fighter) : null;
      const chip = document.createElement("div");
      chip.className = "reveal-chip";
      chip.style.setProperty("--fighter-color", fighter.color);
      const fighterName = document.createElement("span");
      fighterName.textContent = fighter.name;
      const move = document.createElement("strong");
      move.textContent = `${actionIcon(action.type)} ${actionLabelForFighter(action, fighter)}`;
      chip.append(fighterName, move);
      if (target) {
        chip.classList.add("has-target");
        const targetLabel = document.createElement("small");
        targetLabel.className = [
          "reveal-target",
          target.isPlayerTarget ? "is-player-target" : "",
        ].filter(Boolean).join(" ");
        targetLabel.textContent = `→ ${target.label}`;
        chip.append(targetLabel);
      }
      return chip;
    }),
  );
}

function renderOutcomeActions(result) {
  const participants = outcomeFighterOrder(result.selections);
  ui.reveals.classList.add("is-outcome");
  ui.reveals.replaceChildren(
    ...participants.map((fighter, index) => {
      const action = result.selections.get(fighter.id) ?? { type: ACTIONS.WAIT };
      const poseKey = outcomePoseFor(action, result.damage.has(fighter.id));
      const poseImage =
        fighter.actionImages?.[poseKey] ??
        fighter.actionImages?.idle ??
        fighter.image;
      const targetIndex = participants.findIndex(
        (candidate) => candidate.id === action.targetId,
      );
      const facesLeft =
        targetIndex >= 0
          ? targetIndex < index
          : index >= Math.ceil(participants.length / 2);
      const card = document.createElement("article");
      const caption = describeFighterOutcome(fighter, action, result);
      card.className = [
        "outcome-action-card",
        fighter.alive ? "" : "is-out",
      ].filter(Boolean).join(" ");
      card.dataset.fighterId = fighter.id;
      card.dataset.characterId = fighter.characterId ?? "";
      card.dataset.pose = poseKey;
      card.dataset.facing = facesLeft ? "left" : "right";
      card.style.setProperty("--fighter-color", fighter.color);
      card.setAttribute("aria-label", caption);

      const visual = document.createElement("div");
      visual.className = "outcome-action-visual";
      if (poseImage) {
        const image = document.createElement("img");
        image.src = poseImage;
        image.alt = "";
        visual.append(image);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "outcome-action-placeholder";
        placeholder.innerHTML = `
          <span>${fighter.avatar}</span>
          <strong>${actionIcon(action.type)}</strong>
        `;
        visual.append(placeholder);
      }

      const copy = document.createElement("div");
      copy.className = "outcome-action-copy";
      const heading = document.createElement("strong");
      heading.textContent = `${fighter.isHuman ? "YOU" : fighter.name} · ${actionLabelForFighter(action, fighter)}`;
      const statement = document.createElement("p");
      statement.textContent = caption;
      copy.append(heading, statement);
      if (!fighter.alive) {
        const out = document.createElement("span");
        out.className = "outcome-out-badge";
        out.textContent = "OUT";
        visual.append(out);
      }
      card.append(visual, copy);
      return card;
    }),
  );
}

function outcomeFighterOrder(selections) {
  const participants = fighters.filter((fighter) => selections.has(fighter.id));
  const player = participants.find((fighter) => fighter.isHuman);
  const rivals = participants.filter((fighter) => !fighter.isHuman);
  if (!player) return rivals;
  if (rivals.length < 2) return [...rivals, player];
  return [rivals[0], player, ...rivals.slice(1)];
}

function describeFighterOutcome(fighter, action, result) {
  const subject = fighter.isHuman ? "You" : fighter.name;
  const thirdPerson = !fighter.isHuman;
  const target = fighterById(action.targetId);
  const targetName = target?.isHuman ? "you" : target?.name;
  const damage = result.damage.get(fighter.id) ?? 0;
  const blockedShots = result.blockedShots.get(fighter.id) ?? 0;
  const landedShot = result.events.some(
    (event) => event.type === "hit" && event.actorId === fighter.id,
  );
  const shotWasBlocked = result.events.some(
    (event) => event.type === "blocked" && event.actorId === fighter.id,
  );
  const shotWasReflected = result.events.some(
    (event) =>
      event.type === "reflected" &&
      event.targetId === fighter.id &&
      event.reflectedFromId,
  );
  const eliminated = result.events.some(
    (event) => event.type === "eliminated" && event.actorId === fighter.id,
  );
  let statement;

  if (action.type === ACTIONS.BLOCK) {
    statement = blockedShots
      ? `${subject} ${thirdPerson ? "blocks" : "block"} ${blockedShots === 1 ? "the shot" : `${blockedShots} shots`}.`
      : `${subject} ${thirdPerson ? "holds" : "hold"} a block.`;
  } else if (action.type === ACTIONS.RELOAD) {
    statement = `${subject} ${thirdPerson ? "reloads" : "reload"}.`;
  } else if (action.type === ACTIONS.FIRE) {
    const resultText = landedShot
      ? " — hit!"
      : shotWasBlocked
        ? " — blocked!"
        : shotWasReflected
          ? " — reflected!"
          : ".";
    statement = `${subject} ${thirdPerson ? "fires" : "fire"}${targetName ? ` at ${targetName}` : ""}${resultText}`;
  } else if (action.type === ACTIONS.POWER) {
    const powerId = powerIdFor(fighter);
    const resultText =
      powerId === POWER_IDS.QUICKDRAW
        ? landedShot
          ? " — hit!"
          : shotWasBlocked
            ? " — blocked!"
            : shotWasReflected
              ? " — reflected!"
              : "."
        : ".";
    const powerTarget =
      powerId === POWER_IDS.MANIAC
        ? " on everyone"
        : targetName
          ? ` on ${targetName}`
          : "";
    statement = `${subject} ${thirdPerson ? "uses" : "use"} ${powerNameFor(fighter)}${powerTarget}${resultText}`;
  } else {
    statement = damage
      ? `${subject} couldn’t act. ${subject} ${thirdPerson ? "takes" : "take"} ${damage === 1 ? "a hit" : `${damage} hits`}.`
      : `${subject} ${thirdPerson ? "makes" : "make"} no move.`;
  }

  if (action.type !== ACTIONS.WAIT && damage) {
    statement += ` ${subject} ${thirdPerson ? "takes" : "take"} ${damage === 1 ? "a hit" : `${damage} hits`}.`;
  }
  if (eliminated) statement += ` ${subject} ${thirdPerson ? "is" : "are"} out!`;
  return statement;
}

function renderTerritories() {
  const rivals = fighters.filter((fighter) => fighter.alive && !fighter.isHuman);
  const isLeftHandedDuel =
    ui.combat.dataset.layout === "duel-thumb" &&
    ui.combat.dataset.handedness === "left";

  if (isLeftHandedDuel) {
    ui.territoryLeft.style.setProperty("--territory-color", "transparent");
    ui.territoryRight.style.setProperty(
      "--territory-color",
      rivals[0]?.color ?? "transparent",
    );
    ui.territoryLeft.classList.add("is-hidden");
    ui.territoryRight.classList.toggle("is-hidden", rivals.length < 1);
    return;
  }

  ui.territoryLeft.style.setProperty(
    "--territory-color",
    rivals[0]?.color ?? "transparent",
  );
  ui.territoryRight.style.setProperty(
    "--territory-color",
    rivals[1]?.color ?? rivals[0]?.color ?? "transparent",
  );
  ui.territoryLeft.classList.toggle("is-hidden", rivals.length < 1);
  ui.territoryRight.classList.toggle("is-hidden", rivals.length < 2);
}

function animateEvents(events) {
  for (const event of events) {
    const hitEvent =
      event.type === "hit" ||
      event.type === "reflected" ||
      event.type === "wildBackfire";
    const blockEvent = event.type === "blocked";
    if (!hitEvent && !blockEvent) continue;
    const target =
      event.targetId === "you"
        ? ui.combat
        : ui.rivals.querySelector(`[data-fighter-id="${event.targetId}"]`);
    target?.classList.add(hitEvent ? "takes-hit" : "blocks-hit");
    window.setTimeout(
      () => target?.classList.remove("takes-hit", "blocks-hit"),
      OUTCOME_MS - 50,
    );
  }
}

function animateTimer() {
  const update = (now) => {
    if (phase !== "decide" && phase !== "freeze") return;
    const remaining = Math.max(0, deadline - now);
    ui.beatProgress.style.transform = `scaleX(${remaining / deadlineDuration})`;
    timerFrame = requestAnimationFrame(update);
  };
  timerFrame = requestAnimationFrame(update);
}

function describeReveal(selections) {
  const playerAction = selections.get("you")?.type ?? ACTIONS.WAIT;
  return playerAction === ACTIONS.WAIT ? "No move — you’re wide open!" : "Moves up!";
}

function describeOutcome(events) {
  const civilianVictory = events.find(
    (event) => event.type === "civilianVictory" && event.actorId === "you",
  );
  if (civilianVictory) return "SURVIVED FIVE — civilian victory!";
  if (events.some((event) => event.type === "lastStand")) return "Double knockout — last heart holds!";
  if (events.some((event) => event.type === "mirrorVoid")) {
    return "INFINITE VOID — both Mirrors vanish!";
  }
  if (
    events.some(
      (event) => event.type === "wildBackfire" && event.actorId === "you",
    )
  ) {
    return "Everyone blocked — your last bullet found you!";
  }
  const playerPower = events.find((event) => event.type === "power" && event.actorId === "you");
  const playerHit = events.some(
    (event) =>
      (event.type === "hit" || event.type === "reflected") &&
      event.targetId === "you",
  );
  const playerBlocked = events.some(
    (event) => event.type === "blocked" && event.targetId === "you",
  );
  const playerLanded = events.some(
    (event) =>
      event.type === "hit" && event.actorId === "you",
  );
  const playerReflected = events.some(
    (event) => event.type === "reflected" && event.actorId === "you",
  );
  const playerStoneBroke = events.some(
    (event) => event.type === "stoneShattered" && event.actorId === "you",
  );
  const playerEliminated = events.some(
    (event) => event.type === "eliminated" && event.actorId === "you",
  );
  if (
    playerEliminated &&
    powerIdFor(getPlayer()) === POWER_IDS.CIVILIAN
  ) {
    return "One hit ended the Civilian’s survival run!";
  }
  if (playerReflected) return "MIRROR — their shot came straight back!";
  if (playerStoneBroke) return "Your stone skin shattered!";
  if (playerPower) return powerOutcomeMessage(playerPower);
  if (playerHit) return "Ouch — you lost a heart!";
  if (playerLanded) return "Direct hit!";
  if (playerBlocked) return "Blocked!";
  if (events.some((event) => event.type === "reload" && event.actorId === "you")) {
    return "Loaded +1 shot";
  }
  return "Nobody got hurt";
}

function endMatch(winner, reason = "last-standing") {
  phase = "gameover";
  clearTimers();
  const playerWon = winner.isHuman;
  const civilianGoal = reason === "civilian-goal";
  ui.resultBurst.style.setProperty("--winner-color", winner.color);
  ui.winnerMedallion.style.setProperty("--winner-color", winner.color);
  ui.winnerMedallion.dataset.characterId = winner.characterId ?? "";
  ui.winnerMedallion.innerHTML = winner.image
    ? `<img src="${winner.image}" alt="" />`
    : winner.avatar;
  ui.resultEyebrow.textContent = civilianGoal
    ? "FIVE TIMES SURVIVED"
    : "LAST ONE STANDING";
  ui.resultTitle.textContent = playerWon ? "You win!" : `${winner.name} wins`;
  ui.resultSubtitle.textContent = civilianGoal
    ? playerWon
      ? "One heart, no weapon, and still standing."
      : "The Civilian survived five exposed beats."
    : playerWon
      ? `Won on ${winner.hearts} ${winner.hearts === 1 ? "heart" : "hearts"}. Brutal.`
      : "Watch the reloads. Take it back next round.";
  ui.statBeats.textContent = String(stats.beats);
  ui.statBlocks.textContent = String(stats.blocks);
  ui.statReloads.textContent = String(stats.reloads);
  showScreen(ui.result);
}

function pauseMatch() {
  if (phase === "idle" || phase === "gameover") return;
  pausedFromPhase = phase;
  matchToken += 1;
  clearTimers();
  phase = "paused";
  ui.countdownOverlay.hidden = true;
  ui.phase.textContent = "PAUSED";
  ui.eventBanner.textContent = "Tap × to leave or ? for the rules";
  renderActionFan();
}

function openRules() {
  if (phase !== "decide" && phase !== "paused") return;
  if (phase === "decide") pauseMatch();
  ui.rulesModal.hidden = false;
}

function closeRules() {
  ui.rulesModal.hidden = true;
  if (phase === "paused") resumePausedMatch();
}

function showHome() {
  if (multiplayer.socket || multiplayer.room) disconnectOnlineRoom();
  matchToken += 1;
  phase = "idle";
  pausedFromPhase = null;
  clearTimers();
  ui.countdownOverlay.hidden = true;
  ui.onlineLobbyBar.hidden = true;
  ui.rosterStatusText.textContent =
    `${CHARACTERS.filter((character) => character.available).length} of ${ROSTER_SLOT_COUNT} fighters ready`;
  ui.setupCard.hidden = true;
  ui.settingsModal.hidden = true;
  stopTutorialSpeedRound();
  closeRules();
  showScreen(ui.home);
}

function resumePausedMatch() {
  const resumePhase = pausedFromPhase;
  pausedFromPhase = null;
  if (resumePhase === "starting" || resumePhase === "countdown") {
    startCountdown(matchToken);
  } else if (resumePhase === "freeze") {
    beginTimeFreeze(matchToken);
  } else {
    startBeat(matchToken);
  }
}

function showScreen(screen) {
  document.querySelectorAll(".screen").forEach((item) => item.classList.toggle("is-active", item === screen));
}

function clearTimers() {
  window.clearTimeout(phaseTimer);
  cancelAnimationFrame(timerFrame);
}

function getPlayer() {
  return fighters.find((fighter) => fighter.isHuman);
}

function fighterById(id) {
  return fighters.find((fighter) => fighter.id === id);
}

function characterById(id) {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}

function heartSlotCount(fighter) {
  return powerIdFor(fighter) === POWER_IDS.CIVILIAN ? 1 : 3;
}

function heartMarkup(count, minimumSlots = 3) {
  return Array.from(
    { length: Math.max(minimumSlots, count) },
    (_, index) => `<span class="heart ${index >= count ? "is-empty" : ""}" aria-hidden="true">♥</span>`,
  ).join("");
}

function actionLabel(action) {
  return {
    [ACTIONS.BLOCK]: "BLOCK",
    [ACTIONS.RELOAD]: "RELOAD",
    [ACTIONS.FIRE]: "FIRE",
    [ACTIONS.POWER]: "POWER",
    [ACTIONS.WAIT]: "NO MOVE",
  }[action];
}

function actionLabelForFighter(action, fighter) {
  return action.type === ACTIONS.POWER ? powerNameFor(fighter) : actionLabel(action.type);
}

function freezeRevealTarget(action, fighter) {
  const powerId = action.type === ACTIONS.POWER ? powerIdFor(fighter) : null;
  if (action.type === ACTIONS.POWER && powerId === POWER_IDS.MANIAC) {
    return { label: "EVERYONE", isPlayerTarget: true };
  }
  if (
    action.type !== ACTIONS.FIRE &&
    !(action.type === ACTIONS.POWER && powerNeedsTarget(powerId))
  ) {
    return null;
  }
  const target = fighterById(action.targetId);
  if (!target) return null;
  return {
    label: target.isHuman ? "YOU" : target.name.toUpperCase(),
    isPlayerTarget: target.isHuman,
  };
}

function actionThreatensPlayer(action, fighter, player) {
  if (action.type === ACTIONS.FIRE) return action.targetId === player.id;
  if (action.type !== ACTIONS.POWER) return false;
  const powerId = powerIdFor(fighter);
  if (powerId === POWER_IDS.MANIAC) return true;
  return powerId === POWER_IDS.QUICKDRAW && action.targetId === player.id;
}

function actionButtonHint(action, player, target) {
  if (action.type === ACTIONS.FIRE) return target?.name ?? "no target";
  if (action.type === ACTIONS.POWER) {
    const powerId = powerIdFor(player);
    if (powerId === POWER_IDS.CIVILIAN) {
      return `${player.powerUses}/${CIVILIAN_POWER_GOAL} survived`;
    }
    if (player.powerUsed) return "used";
    if (powerId === POWER_IDS.MANIAC) {
      const needed = fighters.filter((fighter) => fighter.alive).length;
      if (player.ammo < needed) return `needs ${needed} shots`;
      return "shoot everyone";
    }
    if (powerId === POWER_IDS.HARDEN) return "+1 stone heart";
    if (powerId === POWER_IDS.SIX_CHAMBER) return "+6 shots";
    if (powerId === POWER_IDS.TIME_FREEZE) return "+4 seconds";
    if (target) return target.name;
    if (powerNeedsTarget(powerId)) return "pick a target";
    return powerNameFor(player);
  }
  return {
    [ACTIONS.BLOCK]: "safe",
    [ACTIONS.RELOAD]: "+1 shot",
  }[action.type] ?? "";
}

function powerNameFor(fighter) {
  return characterById(fighter.characterId).powerName;
}

function defaultPowerTarget(player, rivals) {
  return rivals.find((fighter) => fighter.alive && fighter.id !== player.id) ?? null;
}

function powerOutcomeMessage(event) {
  const target = event.targetId ? fighterById(event.targetId) : null;
  if (event.powerId === POWER_IDS.CIVILIAN) {
    return `SURVIVE — ${event.uses}/${CIVILIAN_POWER_GOAL}`;
  }
  return {
    [POWER_IDS.QUICKDRAW]: target
      ? `QUICKDRAW hit ${target.name}!`
      : "QUICKDRAW!",
    [POWER_IDS.HARDEN]: "HARDEN — gained a stone heart!",
    [POWER_IDS.SIX_CHAMBER]: "6 IN THE CHAMBER — loaded six shots!",
    [POWER_IDS.MIRROR]: target ? `MIRROR copied ${target.name}!` : "MIRROR!",
    [POWER_IDS.TIME_FREEZE]: "TIME FREEZE!",
    [POWER_IDS.MANIAC]: "MANIAC fired on everyone!",
  }[event.powerId] ?? "Power used!";
}

function actionIcon(action) {
  return {
    [ACTIONS.BLOCK]: "⬡",
    [ACTIONS.RELOAD]: "∞",
    [ACTIONS.FIRE]: "✦",
    [ACTIONS.POWER]: "★",
    [ACTIONS.WAIT]: "·",
  }[action];
}

function pulseDevice(pattern) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

window.__QUICK_DRAW_PROTOTYPE__ = {
  get state() {
    return {
      beat,
      phase,
      fighters: fighters.map((fighter) => ({ ...fighter })),
      config: { ...config },
    };
  },
};
})();

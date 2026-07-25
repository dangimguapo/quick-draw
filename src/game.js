(() => {
const {
  ACTIONS,
  POWER_IDS,
  canUsePower,
  chooseRobotAction,
  createFighter,
  powerIdFor,
  powerNeedsTarget,
  resolveTurn,
} = window.QuickDrawEngine;

const DECIDE_MS = 1000;
const REVEAL_MS = 360;
const OUTCOME_MS = 640;

const CHARACTERS = Object.freeze([
  {
    id: "sir-blocksalot",
    name: "Sir Blocksalot",
    shortName: "Blocksalot",
    tagline: "The world’s most defensive knight.",
    powerName: "Double Shield",
    powerDescription: "Blocks this beat and the next one automatically.",
    color: "#2878d0",
    image: "./assets/characters/sir-blocksalot-8bit.png",
    available: true,
  },
  {
    id: "chuck-reloadington",
    name: "Chuck Reloadington",
    shortName: "Chuck",
    tagline: "Reloads faster than he thinks.",
    powerName: "Fast Hands",
    powerDescription: "One reload gives him two shots in a single beat.",
    color: "#cf7b2a",
    image: "./assets/characters/chuck-reloadington-8bit.png",
    available: true,
  },
  {
    id: "peeka-boo",
    name: "Peeka Boo",
    shortName: "Peeka",
    tagline: "The nosiest scout in the west.",
    powerName: "Peek",
    powerDescription: "See one rival’s move the instant they lock it in.",
    color: "#9b54c6",
    image: "./assets/characters/peeka-boo-8bit.png",
    available: true,
  },
  {
    id: "ricochet-rita",
    name: "Ricochet Rita",
    shortName: "Rita",
    tagline: "Never wastes a shot. Ever.",
    powerName: "Bounce",
    powerDescription: "A blocked shot bounces toward the other rival.",
    color: "#268c8a",
    image: "./assets/characters/ricochet-rita-8bit.png",
    available: true,
  },
  {
    id: "nurse-nudge",
    name: "Nurse Nudge",
    shortName: "Nudge",
    tagline: "The frontier medic with nerves of steel.",
    powerName: "Patch Up",
    powerDescription: "Win back one lost heart, never above three.",
    color: "#d8525f",
    image: "./assets/characters/nurse-nudge-8bit.png",
    available: true,
  },
  {
    id: "sticky-sam",
    name: "Sticky Sam",
    shortName: "Sam",
    tagline: "Gums up everybody’s gear.",
    powerName: "Jam",
    powerDescription: "One rival can’t reload on the next beat.",
    color: "#699342",
    image: "./assets/characters/sticky-sam-8bit.png",
    available: true,
  },
]);

const ui = {
  home: document.querySelector("#homeScreen"),
  character: document.querySelector("#characterScreen"),
  combat: document.querySelector("#combatScreen"),
  result: document.querySelector("#resultScreen"),
  start: document.querySelector("#startButton"),
  backToHome: document.querySelector("#backToHomeButton"),
  characterGrid: document.querySelector("#characterGrid"),
  characterFeature: document.querySelector(".character-feature"),
  characterGlow: document.querySelector("#characterGlow"),
  heroCharacterImage: document.querySelector("#heroCharacterImage"),
  comingSoonHero: document.querySelector("#comingSoonHero"),
  heroCharacterName: document.querySelector("#heroCharacterName"),
  heroCharacterTagline: document.querySelector("#heroCharacterTagline"),
  heroPowerName: document.querySelector("#heroPowerName"),
  heroPowerDescription: document.querySelector("#heroPowerDescription"),
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
  ammoCount: document.querySelector("#ammoCount"),
  ammoLabel: document.querySelector("#ammoLabel"),
  playerAvatarImage: document.querySelector("#playerAvatarImage"),
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
  winnerMedallion: document.querySelector("#winnerMedallion"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSubtitle: document.querySelector("#resultSubtitle"),
  statBeats: document.querySelector("#statBeats"),
  statBlocks: document.querySelector("#statBlocks"),
  statReloads: document.querySelector("#statReloads"),
};

const config = { playerCount: 2, difficulty: "medium", characterId: "sir-blocksalot" };
let previewCharacterId = config.characterId;
let fighters = [];
let beat = 0;
let phase = "idle";
let selectedAction = null;
let robotSelections = new Map();
let deadline = 0;
let timerFrame = null;
let phaseTimer = null;
let matchToken = 0;
let pausedFromPhase = null;
let stats = freshStats();

document.querySelectorAll("[data-player-count]").forEach((button) => {
  button.addEventListener("click", () => {
    config.playerCount = Number(button.dataset.playerCount);
    selectSegment("[data-player-count]", button);
  });
});

document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => {
    config.difficulty = button.dataset.difficulty;
    selectSegment("[data-difficulty]", button);
  });
});

ui.start.addEventListener("click", openCharacterSelect);
ui.backToHome.addEventListener("click", showHome);
ui.ready.addEventListener("click", confirmCharacter);
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

function freshStats() {
  return { beats: 0, blocks: 0, reloads: 0, riskyReloads: 0 };
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
  fighters = [
    createFighter({
      id: "you",
      name: "You",
      color: selectedCharacter.color,
      avatar: selectedCharacter.shortName.slice(0, 1),
      isHuman: true,
      characterId: selectedCharacter.id,
      characterName: selectedCharacter.name,
      image: selectedCharacter.image,
    }),
    createFighter({
      id: "mo",
      name: "Mo",
      color: "#cf7b2a",
      avatar: matchRoster[1].shortName.slice(0, 1),
      characterId: matchRoster[1].id,
      characterName: matchRoster[1].name,
      image: matchRoster[1].image,
    }),
  ];
  if (config.playerCount === 3) {
    fighters.push(
      createFighter({
        id: "ava",
        name: "Ava",
        color: "#9b54c6",
        avatar: matchRoster[2].shortName.slice(0, 1),
        characterId: matchRoster[2].id,
        characterName: matchRoster[2].name,
        image: matchRoster[2].image,
      }),
    );
  }

  beat = 0;
  stats = freshStats();
  phase = "starting";
  pausedFromPhase = null;
  selectedAction = null;
  robotSelections = new Map();
  ui.rules.disabled = true;
  ui.countdownOverlay.hidden = true;
  showScreen(ui.combat);
  renderAll();
  phaseTimer = window.setTimeout(() => startCountdown(matchToken), 180);
}

function openCharacterSelect() {
  previewCharacterId = config.characterId;
  renderCharacterSelect();
  showScreen(ui.character);
}

function confirmCharacter() {
  const character = characterById(previewCharacterId);
  if (!character.available) return;
  config.characterId = character.id;
  startMatch();
}

function renderCharacterSelect() {
  const selected = characterById(previewCharacterId);
  ui.characterGrid.replaceChildren(
    ...CHARACTERS.map((character) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "character-card",
        character.id === selected.id ? "is-selected" : "",
        character.available ? "" : "is-coming",
      ]
        .filter(Boolean)
        .join(" ");
      button.style.setProperty("--character-color", character.color);
      button.setAttribute("aria-pressed", String(character.id === selected.id));
      button.setAttribute(
        "aria-label",
        `${character.name}, ${character.powerName}${character.image ? "" : ", placeholder art"}`,
      );
      button.innerHTML = character.image
        ? `
          <img src="${character.image}" alt="" />
          <span class="character-card-copy">
            <strong>${character.name}</strong>
            <span>${character.powerName}</span>
          </span>
        `
        : `
          <span class="roster-placeholder" aria-hidden="true">${character.shortName.slice(0, 1)}</span>
          <span class="character-card-copy">
            <strong>${character.name}</strong>
            <span>${character.powerName}</span>
          </span>
        `;
      button.addEventListener("click", () => {
        previewCharacterId = character.id;
        renderCharacterSelect();
      });
      return button;
    }),
  );

  ui.characterFeature.style.setProperty("--character-color", selected.color);
  ui.characterGlow.style.setProperty("--character-color", selected.color);
  ui.heroCharacterName.textContent = selected.name;
  ui.heroCharacterTagline.textContent = selected.tagline;
  ui.heroPowerName.textContent = selected.powerName;
  ui.heroPowerDescription.textContent = selected.powerDescription;
  ui.heroCharacterImage.hidden = !selected.image;
  ui.comingSoonHero.hidden = Boolean(selected.image);
  if (selected.image) {
    ui.heroCharacterImage.src = selected.image;
    ui.heroCharacterImage.alt = selected.name;
  } else {
    ui.heroCharacterImage.removeAttribute("src");
    ui.heroCharacterImage.alt = "";
  }
  ui.ready.disabled = !selected.available;
  ui.ready.textContent = selected.available ? "LOCK IN" : "ART COMING SOON";
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
  ui.combat.classList.remove("phase-decide", "phase-resolve", "impact");
  ui.combat.classList.add("phase-countdown");
  ui.countdownOverlay.hidden = false;
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
  selectedAction =
    player.alive && player.shieldCarry > 0 ? { type: ACTIONS.BLOCK, forced: true } : null;
  robotSelections = new Map();

  for (const robot of fighters.filter((fighter) => fighter.alive && !fighter.isHuman)) {
    robotSelections.set(robot.id, chooseRobotAction(robot, fighters, config.difficulty));
  }

  ui.beatNumber.textContent = `BEAT ${beat}`;
  ui.phase.textContent = !player.alive
    ? "SPECTATING"
    : selectedAction?.forced
      ? "SHIELD HOLDS"
      : "DECIDE!";
  ui.eventBanner.textContent = !player.alive
    ? "You’re out — last robot standing wins"
    : selectedAction?.forced
      ? "Double Shield protects this beat"
      : "Choose your move";
  ui.reveals.replaceChildren();
  ui.combat.classList.remove("phase-countdown", "phase-resolve", "impact");
  ui.combat.classList.add("phase-decide");
  ui.rules.disabled = false;
  renderAll();
  pulseDevice(18);

  deadline = performance.now() + DECIDE_MS;
  animateTimer();
  phaseTimer = window.setTimeout(() => beginReveal(token), DECIDE_MS);
}

function beginReveal(token) {
  if (token !== matchToken || phase !== "decide") return;
  cancelAnimationFrame(timerFrame);
  phase = "reveal";
  ui.rules.disabled = true;
  ui.phase.textContent = "REVEAL";
  ui.beatProgress.style.transform = "scaleX(0)";
  ui.combat.classList.remove("phase-decide");
  ui.combat.classList.add("phase-resolve");

  const selections = new Map(robotSelections);
  if (getPlayer().alive) {
    selections.set(getPlayer().id, selectedAction ?? { type: ACTIONS.WAIT });
  }
  renderActionFan();
  renderReveals(selections);
  ui.eventBanner.textContent = describeReveal(selections);
  pulseDevice([18, 28]);

  phaseTimer = window.setTimeout(() => finishBeat(token, selections), REVEAL_MS);
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
  ui.combat.classList.add("impact");
  renderAll();
  animateEvents(result.events);
  pulseDevice(result.damage.size ? [25, 35, 45] : 14);

  phaseTimer = window.setTimeout(() => {
    const alive = fighters.filter((fighter) => fighter.alive);
    if (alive.length === 1) {
      endMatch(alive[0]);
    } else {
      startBeat(token);
    }
  }, OUTCOME_MS);
}

function chooseAction(action) {
  if (phase !== "decide" || !getPlayer().alive || action.disabled || selectedAction?.forced) return;
  selectedAction = { type: action.type, targetId: action.targetId };
  const player = getPlayer();
  const target = action.targetId ? fighterById(action.targetId) : null;
  const powerId = powerIdFor(player);

  if (action.type === ACTIONS.POWER && powerId === POWER_IDS.PEEK && target) {
    const rivalAction = robotSelections.get(target.id) ?? { type: ACTIONS.WAIT };
    ui.eventBanner.textContent = `PEEK: ${target.name} chose ${actionLabel(rivalAction.type)}`;
  } else if (action.type === ACTIONS.POWER) {
    ui.eventBanner.textContent = target
      ? `${powerNameFor(player)} targets ${target.name}`
      : `${powerNameFor(player)} locked in`;
  } else {
    ui.eventBanner.textContent =
      action.type === ACTIONS.FIRE
        ? `Targeting ${target.name}`
        : `${actionLabel(action.type)} locked in`;
  }
  renderActionFan();
}

function renderAll() {
  renderTerritories();
  renderRivals();
  renderPlayerHud();
  renderActionFan();
}

function renderRivals() {
  const rivals = fighters.filter((fighter) => !fighter.isHuman);
  ui.rivals.replaceChildren(
    ...rivals.map((fighter) => {
      const card = document.createElement("article");
      card.className = `rival-card ${fighter.alive ? "" : "is-out"}`;
      card.dataset.fighterId = fighter.id;
      card.style.setProperty("--fighter-color", fighter.color);
      card.innerHTML = `
        <div class="rival-avatar" aria-hidden="true">
          ${fighter.image ? `<img src="${fighter.image}" alt="" />` : fighter.avatar}
        </div>
        <div class="rival-copy">
          <strong>${fighter.characterName ?? fighter.name}</strong>
          <div class="rival-hearts">${heartMarkup(fighter.hearts)}</div>
          <span class="secret-ammo">${fighter.name} · ammo ?</span>
        </div>
        <span class="locked-pill">${
          fighter.alive && fighter.jammedTurns > 0
            ? "reload jammed"
            : phase === "decide" && fighter.alive
              ? "locked in"
              : ""
        }</span>
      `;
      return card;
    }),
  );
}

function renderPlayerHud() {
  const player = getPlayer();
  ui.hearts.innerHTML = heartMarkup(player.hearts);
  ui.ammoCount.textContent = String(player.ammo);
  ui.ammoLabel.textContent = player.ammo === 1 ? "shot" : "shots";
  if (player.image) {
    ui.playerAvatarImage.src = player.image;
    ui.playerAvatarImage.hidden = false;
  } else {
    ui.playerAvatarImage.removeAttribute("src");
    ui.playerAvatarImage.hidden = true;
  }
}

function renderActionFan() {
  const player = getPlayer();
  if (!player) return;
  const rivals = fighters.filter((fighter) => !fighter.isHuman);
  const livingRivals = rivals.filter((fighter) => fighter.alive);
  const playerPowerId = powerIdFor(player);
  const powerTarget = powerNeedsTarget(playerPowerId)
    ? defaultPowerTarget(player, livingRivals)
    : null;
  const powerAction = {
    type: ACTIONS.POWER,
    targetId: powerTarget?.id ?? null,
  };
  const powerActions =
    playerPowerId === POWER_IDS.JAM && rivals.length > 1
      ? rivals.map((rival, index) => ({
          type: ACTIONS.POWER,
          targetId: rival.id,
          edge: index === 0 ? "left" : "right",
        }))
      : [powerAction];
  const actions =
    rivals.length === 1
      ? [
          { type: ACTIONS.BLOCK },
          { type: ACTIONS.FIRE, targetId: rivals[0].id },
          { type: ACTIONS.RELOAD },
          powerAction,
        ]
      : playerPowerId === POWER_IDS.JAM && powerActions.length > 1
        ? [
            { type: ACTIONS.FIRE, targetId: rivals[0]?.id, edge: "left" },
            powerActions[0],
            { type: ACTIONS.BLOCK },
            { type: ACTIONS.RELOAD },
            powerActions[1],
            { type: ACTIONS.FIRE, targetId: rivals[1]?.id, edge: "right" },
          ]
      : [
          { type: ACTIONS.FIRE, targetId: rivals[0]?.id, edge: "left" },
          { type: ACTIONS.BLOCK },
          { type: ACTIONS.RELOAD },
          ...powerActions,
          { type: ACTIONS.FIRE, targetId: rivals[1]?.id, edge: "right" },
        ];

  ui.actionFan.dataset.count = String(actions.length);
  ui.actionFan.replaceChildren(
    ...actions.map((action, index) => {
      const target = action.targetId ? fighterById(action.targetId) : null;
      const disabled =
        phase !== "decide" ||
        !player.alive ||
        Boolean(selectedAction?.forced) ||
        (Boolean(action.targetId) && !target?.alive) ||
        (action.type === ACTIONS.FIRE && (player.ammo < 1 || !target)) ||
        (action.type === ACTIONS.POWER && !canUsePower(player, fighters, action));
      const selected =
        selectedAction?.type === action.type &&
        (!action.targetId || selectedAction.targetId === action.targetId);
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
  const active = fighters.filter((fighter) => fighter.alive);
  ui.reveals.replaceChildren(
    ...active.map((fighter) => {
      const action = selections.get(fighter.id) ?? { type: ACTIONS.WAIT };
      const chip = document.createElement("div");
      chip.className = "reveal-chip";
      chip.style.setProperty("--fighter-color", fighter.color);
      chip.innerHTML = `
        <span>${fighter.name}</span>
        <strong>${actionIcon(action.type)} ${actionLabelForFighter(action, fighter)}</strong>
      `;
      return chip;
    }),
  );
}

function renderTerritories() {
  const rivals = fighters.filter((fighter) => fighter.alive && !fighter.isHuman);
  ui.territoryLeft.style.setProperty("--territory-color", rivals[0]?.color ?? "transparent");
  ui.territoryRight.style.setProperty("--territory-color", rivals[1]?.color ?? rivals[0]?.color ?? "transparent");
  ui.territoryRight.classList.toggle("is-hidden", rivals.length < 2);
}

function animateEvents(events) {
  for (const event of events) {
    const hitEvent = event.type === "hit" || event.type === "ricochet";
    const blockEvent = event.type === "blocked" || event.type === "ricochetBlocked";
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
    if (phase !== "decide") return;
    const remaining = Math.max(0, deadline - now);
    ui.beatProgress.style.transform = `scaleX(${remaining / DECIDE_MS})`;
    timerFrame = requestAnimationFrame(update);
  };
  timerFrame = requestAnimationFrame(update);
}

function describeReveal(selections) {
  const playerAction = selections.get("you")?.type ?? ACTIONS.WAIT;
  return playerAction === ACTIONS.WAIT ? "No move — you’re wide open!" : "Moves up!";
}

function describeOutcome(events) {
  if (events.some((event) => event.type === "lastStand")) return "Double knockout — last heart holds!";
  const playerPower = events.find((event) => event.type === "power" && event.actorId === "you");
  const playerJammed = events.some((event) => event.type === "jammed" && event.actorId === "you");
  const ricochet = events.find(
    (event) => event.type === "ricochet" && event.actorId === "you",
  );
  const playerHit = events.some(
    (event) =>
      (event.type === "hit" || event.type === "ricochet") && event.targetId === "you",
  );
  const playerBlocked = events.some(
    (event) =>
      (event.type === "blocked" || event.type === "ricochetBlocked") &&
      event.targetId === "you",
  );
  const playerLanded = events.some(
    (event) =>
      (event.type === "hit" || event.type === "ricochet") && event.actorId === "you",
  );
  if (playerJammed) return "JAMMED — your reload fizzled!";
  if (ricochet) return `BOUNCE hit ${fighterById(ricochet.targetId).name}!`;
  if (playerPower) return powerOutcomeMessage(playerPower);
  if (playerHit) return "Ouch — you lost a heart!";
  if (playerLanded) return "Direct hit!";
  if (playerBlocked) return "Blocked!";
  if (events.some((event) => event.type === "reload" && event.actorId === "you")) {
    return "Loaded +1 shot";
  }
  return "Nobody got hurt";
}

function endMatch(winner) {
  phase = "gameover";
  clearTimers();
  const playerWon = winner.isHuman;
  ui.resultBurst.style.setProperty("--winner-color", winner.color);
  ui.winnerMedallion.style.setProperty("--winner-color", winner.color);
  ui.winnerMedallion.innerHTML = winner.image
    ? `<img src="${winner.image}" alt="" />`
    : winner.avatar;
  ui.resultTitle.textContent = playerWon ? "You win!" : `${winner.name} wins`;
  ui.resultSubtitle.textContent = playerWon
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
  matchToken += 1;
  phase = "idle";
  pausedFromPhase = null;
  clearTimers();
  ui.countdownOverlay.hidden = true;
  closeRules();
  showScreen(ui.home);
}

function resumePausedMatch() {
  const resumePhase = pausedFromPhase;
  pausedFromPhase = null;
  if (resumePhase === "starting" || resumePhase === "countdown") {
    startCountdown(matchToken);
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

function heartMarkup(count) {
  return Array.from(
    { length: 3 },
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

function actionButtonHint(action, player, target) {
  if (action.type === ACTIONS.FIRE) return target?.name ?? "no target";
  if (action.type === ACTIONS.POWER) {
    if (player.powerUsed) return "used";
    const powerId = powerIdFor(player);
    if (powerId === POWER_IDS.BOUNCE && player.ammo < 1) return "needs 1 shot";
    if (powerId === POWER_IDS.PATCH_UP && player.hearts >= 3) return "at full hearts";
    if (target) return target.name;
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
  return {
    [POWER_IDS.DOUBLE_SHIELD]: "DOUBLE SHIELD — one more protected beat!",
    [POWER_IDS.FAST_HANDS]: "FAST HANDS — loaded 2 shots!",
    [POWER_IDS.PEEK]: target ? `PEEKED at ${target.name}’s move!` : "PEEK!",
    [POWER_IDS.BOUNCE]: "BOUNCE shot fired!",
    [POWER_IDS.PATCH_UP]: "PATCH UP — recovered 1 heart!",
    [POWER_IDS.JAM]: target ? `JAMMED ${target.name}’s next reload!` : "JAM!",
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

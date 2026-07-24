export const ACTIONS = Object.freeze({
  BLOCK: "block",
  RELOAD: "reload",
  FIRE: "fire",
  POWER: "power",
  WAIT: "wait",
});

export function createFighter({
  id,
  name,
  color,
  avatar,
  isHuman = false,
  characterId = null,
  characterName = null,
  image = null,
}) {
  return {
    id,
    name,
    color,
    avatar,
    isHuman,
    characterId,
    characterName,
    image,
    hearts: 3,
    ammo: 0,
    alive: true,
    powerUsed: false,
    shieldCarry: 0,
    lastAction: null,
  };
}

export function resolveTurn(fighters, selections) {
  const active = fighters.filter((fighter) => fighter.alive);
  const events = [];
  const damage = new Map();
  const blockedShots = new Map();
  const reloaded = new Set();

  const normalized = new Map(
    active.map((fighter) => {
      const requested = selections.get(fighter.id) ?? { type: ACTIONS.WAIT };
      const action =
        requested.type === ACTIONS.FIRE && fighter.ammo < 1
          ? { type: ACTIONS.WAIT }
          : requested.type === ACTIONS.POWER && fighter.powerUsed
            ? { type: ACTIONS.WAIT }
            : requested;
      return [fighter.id, action];
    }),
  );

  const blocking = new Set();
  for (const fighter of active) {
    const action = normalized.get(fighter.id);
    if (action.type === ACTIONS.BLOCK || action.type === ACTIONS.POWER || fighter.shieldCarry > 0) {
      blocking.add(fighter.id);
    }
  }

  for (const fighter of active) {
    const action = normalized.get(fighter.id);

    if (action.type === ACTIONS.RELOAD) {
      fighter.ammo += 1;
      reloaded.add(fighter.id);
      events.push({ type: "reload", actorId: fighter.id });
    }

    if (action.type === ACTIONS.FIRE) {
      fighter.ammo -= 1;
      const target = fighters.find((candidate) => candidate.id === action.targetId && candidate.alive);
      if (!target) continue;

      if (blocking.has(target.id)) {
        blockedShots.set(target.id, (blockedShots.get(target.id) ?? 0) + 1);
        events.push({ type: "blocked", actorId: fighter.id, targetId: target.id });
      } else {
        damage.set(target.id, (damage.get(target.id) ?? 0) + 1);
        events.push({ type: "hit", actorId: fighter.id, targetId: target.id });
      }
    }
  }

  for (const fighter of active) {
    const action = normalized.get(fighter.id);
    if (fighter.shieldCarry > 0) fighter.shieldCarry -= 1;
    if (action.type === ACTIONS.POWER) {
      fighter.powerUsed = true;
      fighter.shieldCarry = 1;
      events.push({ type: "power", actorId: fighter.id });
    }
    fighter.lastAction = action.type;
  }

  for (const [fighterId, hitCount] of damage) {
    const fighter = fighters.find((candidate) => candidate.id === fighterId);
    fighter.hearts = Math.max(0, fighter.hearts - hitCount);
  }

  for (const fighter of active) {
    if (fighter.hearts === 0) {
      fighter.alive = false;
      events.push({ type: "eliminated", actorId: fighter.id });
    }
  }

  // The design promises no draws. A total simultaneous knockout resets the
  // finalists to one heart and empty ammo so the next beat decides it cleanly.
  if (!fighters.some((fighter) => fighter.alive)) {
    for (const fighter of active) {
      fighter.hearts = 1;
      fighter.ammo = 0;
      fighter.alive = true;
    }
    events.push({ type: "lastStand" });
  }

  return { events, selections: normalized, damage, blockedShots, reloaded };
}

export function chooseRobotAction(robot, fighters, difficulty = "medium", random = Math.random) {
  if (robot.shieldCarry > 0) return { type: ACTIONS.BLOCK, forced: true };

  const targets = fighters.filter((fighter) => fighter.alive && fighter.id !== robot.id);
  const target = pickTarget(targets, difficulty, random);

  if (!robot.powerUsed && robot.hearts === 1 && random() < difficultyChance(difficulty, 0.1, 0.22, 0.4)) {
    return { type: ACTIONS.POWER };
  }

  if (robot.ammo === 0) {
    return random() < difficultyChance(difficulty, 0.7, 0.58, 0.48)
      ? { type: ACTIONS.RELOAD }
      : { type: ACTIONS.BLOCK };
  }

  const exposedTarget = targets.find(
    (fighter) => fighter.lastAction === ACTIONS.RELOAD || fighter.lastAction === ACTIONS.POWER,
  );
  if (exposedTarget && random() < difficultyChance(difficulty, 0.3, 0.62, 0.86)) {
    return { type: ACTIONS.FIRE, targetId: exposedTarget.id };
  }

  const roll = random();
  const fireChance = difficultyChance(difficulty, 0.3, 0.46, 0.58);
  const blockChance = difficultyChance(difficulty, 0.22, 0.3, 0.34);
  if (roll < fireChance) return { type: ACTIONS.FIRE, targetId: target.id };
  if (roll < fireChance + blockChance) return { type: ACTIONS.BLOCK };
  return { type: ACTIONS.RELOAD };
}

function pickTarget(targets, difficulty, random) {
  if (difficulty === "hard") {
    return [...targets].sort((a, b) => a.hearts - b.hearts || b.ammo - a.ammo)[0];
  }
  return targets[Math.floor(random() * targets.length)];
}

function difficultyChance(difficulty, easy, medium, hard) {
  return { easy, medium, hard }[difficulty] ?? medium;
}

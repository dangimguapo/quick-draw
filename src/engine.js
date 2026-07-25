(() => {
const ACTIONS = Object.freeze({
  BLOCK: "block",
  RELOAD: "reload",
  FIRE: "fire",
  POWER: "power",
  WAIT: "wait",
});

const POWER_IDS = Object.freeze({
  DOUBLE_SHIELD: "double-shield",
  FAST_HANDS: "fast-hands",
  PEEK: "peek",
  BOUNCE: "bounce",
  PATCH_UP: "patch-up",
  JAM: "jam",
});

const CHARACTER_POWERS = Object.freeze({
  "sir-blocksalot": POWER_IDS.DOUBLE_SHIELD,
  "chuck-reloadington": POWER_IDS.FAST_HANDS,
  "peeka-boo": POWER_IDS.PEEK,
  "ricochet-rita": POWER_IDS.BOUNCE,
  "nurse-nudge": POWER_IDS.PATCH_UP,
  "sticky-sam": POWER_IDS.JAM,
});

function createFighter({
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
    jammedTurns: 0,
    lastAction: null,
  };
}

function powerIdFor(fighter) {
  return CHARACTER_POWERS[fighter?.characterId] ?? POWER_IDS.DOUBLE_SHIELD;
}

function powerNeedsTarget(powerId) {
  return powerId === POWER_IDS.PEEK || powerId === POWER_IDS.BOUNCE || powerId === POWER_IDS.JAM;
}

function canUsePower(fighter, fighters, action = { type: ACTIONS.POWER }) {
  if (!fighter?.alive || fighter.powerUsed) return false;
  const powerId = powerIdFor(fighter);
  if (powerId === POWER_IDS.BOUNCE && fighter.ammo < 1) return false;
  if (powerId === POWER_IDS.PATCH_UP && fighter.hearts >= 3) return false;
  if (!powerNeedsTarget(powerId)) return true;
  return Boolean(resolvePowerTarget(fighter, fighters, action.targetId));
}

function resolveTurn(fighters, selections) {
  const active = fighters.filter((fighter) => fighter.alive);
  const events = [];
  const damage = new Map();
  const blockedShots = new Map();
  const reloaded = new Set();
  const jammedAtStart = new Map(active.map((fighter) => [fighter.id, fighter.jammedTurns]));
  const pendingJams = [];

  const normalized = new Map(
    active.map((fighter) => {
      const requested = selections.get(fighter.id) ?? { type: ACTIONS.WAIT };
      let action = { ...requested };

      if (action.type === ACTIONS.FIRE && fighter.ammo < 1) {
        action = { type: ACTIONS.WAIT };
      }

      if (action.type === ACTIONS.RELOAD && (jammedAtStart.get(fighter.id) ?? 0) > 0) {
        events.push({ type: "jammed", actorId: fighter.id });
        action = { type: ACTIONS.WAIT };
      }

      if (action.type === ACTIONS.POWER) {
        const powerId = powerIdFor(fighter);
        const target = resolvePowerTarget(fighter, fighters, action.targetId);
        action = {
          ...action,
          powerId,
          targetId: target?.id ?? null,
        };
        if (!canUsePower(fighter, fighters, action)) {
          action = { type: ACTIONS.WAIT };
        }
      }

      return [fighter.id, action];
    }),
  );

  const blocking = new Set();
  for (const fighter of active) {
    const action = normalized.get(fighter.id);
    const doubleShield =
      action.type === ACTIONS.POWER && action.powerId === POWER_IDS.DOUBLE_SHIELD;
    if (action.type === ACTIONS.BLOCK || doubleShield || fighter.shieldCarry > 0) {
      blocking.add(fighter.id);
    }
  }

  const addDamage = (targetId, amount = 1) => {
    damage.set(targetId, (damage.get(targetId) ?? 0) + amount);
  };

  const performShot = (fighter, action, ricochets = false) => {
    const target = fighters.find(
      (candidate) => candidate.id === action.targetId && candidate.alive,
    );
    if (!target) return;

    if (!blocking.has(target.id)) {
      addDamage(target.id);
      events.push({
        type: "hit",
        actorId: fighter.id,
        targetId: target.id,
        powerId: ricochets ? POWER_IDS.BOUNCE : null,
      });
      return;
    }

    blockedShots.set(target.id, (blockedShots.get(target.id) ?? 0) + 1);
    events.push({
      type: "blocked",
      actorId: fighter.id,
      targetId: target.id,
      powerId: ricochets ? POWER_IDS.BOUNCE : null,
    });

    if (!ricochets) return;
    const ricochetTarget = active.find(
      (candidate) => candidate.id !== fighter.id && candidate.id !== target.id,
    );
    if (!ricochetTarget) {
      events.push({ type: "ricochetMiss", actorId: fighter.id, targetId: target.id });
      return;
    }

    if (blocking.has(ricochetTarget.id)) {
      blockedShots.set(
        ricochetTarget.id,
        (blockedShots.get(ricochetTarget.id) ?? 0) + 1,
      );
      events.push({
        type: "ricochetBlocked",
        actorId: fighter.id,
        targetId: ricochetTarget.id,
        bouncedFromId: target.id,
      });
      return;
    }

    addDamage(ricochetTarget.id);
    events.push({
      type: "ricochet",
      actorId: fighter.id,
      targetId: ricochetTarget.id,
      bouncedFromId: target.id,
    });
  };

  for (const fighter of active) {
    const action = normalized.get(fighter.id);

    if (action.type === ACTIONS.RELOAD) {
      fighter.ammo += 1;
      reloaded.add(fighter.id);
      events.push({ type: "reload", actorId: fighter.id, amount: 1 });
    }

    if (action.type === ACTIONS.FIRE) {
      fighter.ammo -= 1;
      performShot(fighter, action);
    }

    if (action.type === ACTIONS.POWER) {
      fighter.powerUsed = true;
      events.push({
        type: "power",
        actorId: fighter.id,
        targetId: action.targetId,
        powerId: action.powerId,
      });

      if (action.powerId === POWER_IDS.FAST_HANDS) {
        fighter.ammo += 2;
        reloaded.add(fighter.id);
        events.push({ type: "reload", actorId: fighter.id, amount: 2, powerId: action.powerId });
      }

      if (action.powerId === POWER_IDS.BOUNCE) {
        fighter.ammo -= 1;
        performShot(fighter, action, true);
      }

      if (action.powerId === POWER_IDS.PATCH_UP) {
        const before = fighter.hearts;
        fighter.hearts = Math.min(3, fighter.hearts + 1);
        events.push({
          type: "heal",
          actorId: fighter.id,
          amount: fighter.hearts - before,
          powerId: action.powerId,
        });
      }

      if (action.powerId === POWER_IDS.JAM && action.targetId) {
        pendingJams.push({ actorId: fighter.id, targetId: action.targetId });
      }
    }
  }

  for (const fighter of active) {
    const action = normalized.get(fighter.id);
    if (fighter.shieldCarry > 0) fighter.shieldCarry -= 1;
    if ((jammedAtStart.get(fighter.id) ?? 0) > 0) {
      fighter.jammedTurns = Math.max(0, fighter.jammedTurns - 1);
    }
    if (
      action.type === ACTIONS.POWER &&
      action.powerId === POWER_IDS.DOUBLE_SHIELD
    ) {
      fighter.shieldCarry = 1;
    }
    fighter.lastAction = action.type;
  }

  for (const jam of pendingJams) {
    const target = fighters.find((fighter) => fighter.id === jam.targetId && fighter.alive);
    if (!target) continue;
    target.jammedTurns = Math.max(target.jammedTurns, 1);
    events.push({ type: "jam", actorId: jam.actorId, targetId: target.id });
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

  // A total simultaneous knockout resets only the finalists, avoiding a draw.
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

function chooseRobotAction(robot, fighters, difficulty = "medium", random = Math.random) {
  if (robot.shieldCarry > 0) return { type: ACTIONS.BLOCK, forced: true };

  const targets = fighters.filter((fighter) => fighter.alive && fighter.id !== robot.id);
  const target = pickTarget(targets, difficulty, random);
  const powerId = powerIdFor(robot);
  const powerChance = difficultyChance(difficulty, 0.16, 0.28, 0.42);

  if (!robot.powerUsed && random() < powerChance) {
    const targetedPower = { type: ACTIONS.POWER, targetId: target?.id };
    const shouldUse =
      (powerId === POWER_IDS.DOUBLE_SHIELD && robot.hearts === 1) ||
      (powerId === POWER_IDS.FAST_HANDS && robot.ammo <= 1) ||
      powerId === POWER_IDS.PEEK ||
      (powerId === POWER_IDS.BOUNCE && robot.ammo > 0) ||
      (powerId === POWER_IDS.PATCH_UP && robot.hearts < 3) ||
      (powerId === POWER_IDS.JAM && targets.some((candidate) => candidate.ammo > 0));
    if (shouldUse && canUsePower(robot, fighters, targetedPower)) return targetedPower;
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

function resolvePowerTarget(fighter, fighters, requestedTargetId) {
  const targets = fighters.filter(
    (candidate) => candidate.alive && candidate.id !== fighter.id,
  );
  if (requestedTargetId) {
    return targets.find((candidate) => candidate.id === requestedTargetId) ?? null;
  }
  return (
    [...targets].sort((a, b) => b.ammo - a.ammo || a.hearts - b.hearts)[0] ??
    null
  );
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

window.QuickDrawEngine = Object.freeze({
  ACTIONS,
  POWER_IDS,
  canUsePower,
  chooseRobotAction,
  createFighter,
  powerIdFor,
  powerNeedsTarget,
  resolveTurn,
});
})();

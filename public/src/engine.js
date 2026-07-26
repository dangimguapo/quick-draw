(() => {
const ACTIONS = Object.freeze({
  BLOCK: "block",
  RELOAD: "reload",
  FIRE: "fire",
  POWER: "power",
  WAIT: "wait",
});

const POWER_IDS = Object.freeze({
  QUICKDRAW: "quickdraw",
  HARDEN: "harden",
  SIX_CHAMBER: "six-chamber",
  MIRROR: "mirror",
  TIME_FREEZE: "time-freeze",
  MANIAC: "maniac",
  CIVILIAN: "civilian-survive",
});

const CIVILIAN_POWER_GOAL = 5;

const CHARACTER_POWERS = Object.freeze({
  quickdraw: POWER_IDS.QUICKDRAW,
  "body-boulder": POWER_IDS.HARDEN,
  sheriff: POWER_IDS.SIX_CHAMBER,
  mirror: POWER_IDS.MIRROR,
  "time-freeze": POWER_IDS.TIME_FREEZE,
  maniac: POWER_IDS.MANIAC,
  civilian: POWER_IDS.CIVILIAN,
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
  actionImages = null,
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
    actionImages,
    hearts: characterId === "civilian" ? 1 : 3,
    ammo: 0,
    alive: true,
    powerUsed: false,
    powerUses: 0,
    hardened: false,
    lastAction: null,
  };
}

function outcomePoseFor(action, tookDamage = false) {
  if (action?.type && action.type !== ACTIONS.WAIT) return action.type;
  return tookDamage ? "hit" : "idle";
}

function powerIdFor(fighter) {
  return CHARACTER_POWERS[fighter?.characterId] ?? POWER_IDS.QUICKDRAW;
}

function powerNeedsTarget(powerId) {
  return powerId === POWER_IDS.QUICKDRAW || powerId === POWER_IDS.MIRROR;
}

function canUsePower(fighter, fighters, action = { type: ACTIONS.POWER }) {
  if (!fighter?.alive) return false;
  const powerId = powerIdFor(fighter);
  if (powerId === POWER_IDS.CIVILIAN) {
    return fighter.powerUses < CIVILIAN_POWER_GOAL;
  }
  if (fighter.powerUsed) return false;
  if (powerId === POWER_IDS.MANIAC) {
    return fighter.ammo >= fighters.filter((candidate) => candidate.alive).length;
  }
  if (!powerNeedsTarget(powerId)) return true;
  return Boolean(resolvePowerTarget(fighter, fighters, action.targetId));
}

function resolveTurn(fighters, selections) {
  const active = fighters.filter((fighter) => fighter.alive);
  const events = [];
  const damage = new Map();
  const blockedShots = new Map();
  const reloaded = new Set();

  const normalized = new Map(
    active.map((fighter) => {
      const requested = selections.get(fighter.id) ?? { type: ACTIONS.WAIT };
      let action = { ...requested };
      const fighterPowerId = powerIdFor(fighter);

      if (
        fighterPowerId === POWER_IDS.CIVILIAN &&
        action.type !== ACTIONS.BLOCK &&
        action.type !== ACTIONS.POWER &&
        action.type !== ACTIONS.WAIT
      ) {
        action = { type: ACTIONS.WAIT };
      }

      if (action.type === ACTIONS.FIRE && fighter.ammo < 1) {
        action = { type: ACTIONS.WAIT };
      }

      if (action.type === ACTIONS.POWER) {
        const powerId = powerIdFor(fighter);
        const target = resolvePowerTarget(fighter, fighters, action.targetId);
        action = { ...action, powerId, targetId: target?.id ?? null };
        if (!canUsePower(fighter, fighters, action)) {
          action = { type: ACTIONS.WAIT };
        }
      }

      return [fighter.id, action];
    }),
  );

  const mirrorPairs = new Set();
  for (const fighter of active) {
    const action = normalized.get(fighter.id);
    if (action.type !== ACTIONS.POWER || action.powerId !== POWER_IDS.MIRROR) continue;
    const targetAction = normalized.get(action.targetId);
    if (
      targetAction?.type === ACTIONS.POWER &&
      targetAction.powerId === POWER_IDS.MIRROR &&
      targetAction.targetId === fighter.id
    ) {
      mirrorPairs.add(fighter.id);
      mirrorPairs.add(action.targetId);
    }
  }

  const blocking = new Set(
    active
      .filter((fighter) => {
        const action = normalized.get(fighter.id);
        if (action.type === ACTIONS.BLOCK) return true;
        if (action.type !== ACTIONS.POWER || action.powerId !== POWER_IDS.MIRROR) {
          return false;
        }
        return normalized.get(action.targetId)?.type === ACTIONS.BLOCK;
      })
      .map((fighter) => fighter.id),
  );

  const addDamage = (targetId, amount = 1, event = null) => {
    damage.set(targetId, (damage.get(targetId) ?? 0) + amount);
    if (event) events.push(event);
  };

  const performShot = (shooter, targetId, powerId = null) => {
    const target = fighters.find(
      (candidate) => candidate.id === targetId && candidate.alive,
    );
    if (!target) return;

    if (blocking.has(target.id)) {
      blockedShots.set(target.id, (blockedShots.get(target.id) ?? 0) + 1);
      events.push({
        type: "blocked",
        actorId: shooter.id,
        targetId: target.id,
        powerId,
      });
      return;
    }

    const targetAction = normalized.get(target.id);
    const mirrorsShooter =
      targetAction?.type === ACTIONS.POWER &&
      targetAction.powerId === POWER_IDS.MIRROR &&
      targetAction.targetId === shooter.id;
    if (mirrorsShooter) {
      addDamage(shooter.id, 1, {
        type: "reflected",
        actorId: target.id,
        targetId: shooter.id,
        reflectedFromId: target.id,
        powerId: POWER_IDS.MIRROR,
      });
      return;
    }

    addDamage(target.id, 1, {
      type: "hit",
      actorId: shooter.id,
      targetId: target.id,
      powerId,
    });
  };

  for (const fighter of active) {
    const action = normalized.get(fighter.id);

    if (action.type === ACTIONS.RELOAD) {
      fighter.ammo += 1;
      reloaded.add(fighter.id);
      events.push({ type: "reload", actorId: fighter.id, amount: 1 });
    }

    if (action.type !== ACTIONS.POWER) continue;
    if (action.powerId === POWER_IDS.CIVILIAN) {
      fighter.powerUses += 1;
    } else {
      fighter.powerUsed = true;
    }
    events.push({
      type: "power",
      actorId: fighter.id,
      targetId: action.targetId,
      powerId: action.powerId,
      uses: fighter.powerUses,
    });

    if (action.powerId === POWER_IDS.SIX_CHAMBER) {
      fighter.ammo += 6;
      reloaded.add(fighter.id);
      events.push({
        type: "reload",
        actorId: fighter.id,
        amount: 6,
        powerId: action.powerId,
      });
    }

    if (action.powerId === POWER_IDS.HARDEN) {
      const before = fighter.hearts;
      fighter.hearts = Math.min(4, fighter.hearts + 1);
      fighter.hardened = true;
      events.push({
        type: "hardened",
        actorId: fighter.id,
        amount: fighter.hearts - before,
        powerId: action.powerId,
      });
    }

    if (action.powerId === POWER_IDS.MIRROR) {
      const targetAction = normalized.get(action.targetId);
      if (targetAction?.type === ACTIONS.RELOAD) {
        fighter.ammo += 1;
        reloaded.add(fighter.id);
        events.push({
          type: "reload",
          actorId: fighter.id,
          amount: 1,
          powerId: action.powerId,
        });
      }
    }
  }

  if (mirrorPairs.size) {
    const pair = [...mirrorPairs];
    for (const fighterId of pair) {
      const fighter = fighters.find((candidate) => candidate.id === fighterId);
      addDamage(fighterId, fighter.hearts);
    }
    events.push({ type: "mirrorVoid", fighterIds: pair });
  }

  for (const fighter of active) {
    if (mirrorPairs.has(fighter.id)) continue;
    const action = normalized.get(fighter.id);

    if (action.type === ACTIONS.FIRE) {
      fighter.ammo -= 1;
      performShot(fighter, action.targetId);
    }

    if (action.type === ACTIONS.POWER && action.powerId === POWER_IDS.QUICKDRAW) {
      performShot(fighter, action.targetId, action.powerId);
    }

    if (action.type === ACTIONS.POWER && action.powerId === POWER_IDS.MANIAC) {
      const targets = active.filter((candidate) => candidate.id !== fighter.id);
      fighter.ammo -= active.length;
      for (const target of targets) performShot(fighter, target.id, action.powerId);

      if (targets.length && targets.every((target) => blocking.has(target.id))) {
        addDamage(fighter.id, fighter.hearts, {
          type: "wildBackfire",
          actorId: fighter.id,
          targetId: fighter.id,
          powerId: action.powerId,
        });
      }
    }
  }

  for (const fighter of active) {
    fighter.lastAction = normalized.get(fighter.id).type;
  }

  for (const [fighterId, hitCount] of damage) {
    const fighter = fighters.find((candidate) => candidate.id === fighterId);
    fighter.hearts = Math.max(0, fighter.hearts - hitCount);
    if (fighter.hardened && hitCount > 0) {
      fighter.hardened = false;
      events.push({ type: "stoneShattered", actorId: fighter.id });
    }
  }

  for (const fighter of active) {
    if (fighter.hearts === 0) {
      fighter.alive = false;
      if (powerIdFor(fighter) === POWER_IDS.CIVILIAN) fighter.powerUses = 0;
      events.push({ type: "eliminated", actorId: fighter.id });
    }
  }

  if (!fighters.some((fighter) => fighter.alive)) {
    for (const fighter of active) {
      fighter.hearts = 1;
      fighter.ammo = 0;
      fighter.alive = true;
      fighter.hardened = false;
      if (powerIdFor(fighter) === POWER_IDS.CIVILIAN) fighter.powerUses = 0;
    }
    events.push({ type: "lastStand" });
  }

  const civilianWinner = fighters.find(
    (fighter) =>
      fighter.alive &&
      powerIdFor(fighter) === POWER_IDS.CIVILIAN &&
      fighter.powerUses >= CIVILIAN_POWER_GOAL,
  );
  if (civilianWinner) {
    events.push({
      type: "civilianVictory",
      actorId: civilianWinner.id,
      uses: civilianWinner.powerUses,
    });
  }

  return { events, selections: normalized, damage, blockedShots, reloaded };
}

function chooseRobotAction(robot, fighters, difficulty = "medium", random = Math.random) {
  const targets = fighters.filter(
    (fighter) => fighter.alive && fighter.id !== robot.id,
  );
  const target = pickTarget(targets, difficulty, random);
  const powerId = powerIdFor(robot);
  const powerChance = difficultyChance(difficulty, 0.16, 0.3, 0.44);
  const powerAction = {
    type: ACTIONS.POWER,
    targetId: powerNeedsTarget(powerId) ? target?.id : null,
  };

  if (powerId === POWER_IDS.CIVILIAN) {
    const usePower =
      canUsePower(robot, fighters, powerAction) &&
      random() < difficultyChance(difficulty, 0.52, 0.64, 0.76);
    return usePower ? powerAction : { type: ACTIONS.BLOCK };
  }

  if (!robot.powerUsed && random() < powerChance) {
    const shouldUse =
      powerId === POWER_IDS.QUICKDRAW ||
      (powerId === POWER_IDS.HARDEN && robot.hearts <= 2) ||
      (powerId === POWER_IDS.SIX_CHAMBER && robot.ammo <= 1) ||
      (powerId === POWER_IDS.MIRROR && targets.some((candidate) => candidate.ammo > 0)) ||
      (powerId === POWER_IDS.TIME_FREEZE && targets.some((candidate) => candidate.ammo > 0)) ||
      powerId === POWER_IDS.MANIAC;
    if (shouldUse && canUsePower(robot, fighters, powerAction)) return powerAction;
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
  if (roll < fireChance) return { type: ACTIONS.FIRE, targetId: target?.id };
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
    [...targets].sort((left, right) => right.ammo - left.ammo || left.hearts - right.hearts)[0] ??
    null
  );
}

function pickTarget(targets, difficulty, random) {
  if (!targets.length) return null;
  if (difficulty === "hard") {
    return [...targets].sort(
      (left, right) => left.hearts - right.hearts || right.ammo - left.ammo,
    )[0];
  }
  return targets[Math.floor(random() * targets.length)];
}

function difficultyChance(difficulty, easy, medium, hard) {
  return { easy, medium, hard }[difficulty] ?? medium;
}

window.QuickDrawEngine = Object.freeze({
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
});
})();

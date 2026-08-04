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
  DOUSE: "douse",
  STICKY_FINGERS: "sticky-fingers",
  JUMBLE: "jumble",
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
  arsonist: POWER_IDS.DOUSE,
  "sticky-fingers": POWER_IDS.STICKY_FINGERS,
  "circus-freak": POWER_IDS.JUMBLE,
});

const CHARACTER_IDS = Object.freeze(Object.keys(CHARACTER_POWERS));

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
    dousedTurns: 0,
    dousedById: null,
    lastAction: null,
  };
}

function outcomePoseFor(action, tookDamage = false) {
  if (action?.type && action.type !== ACTIONS.WAIT) return action.type;
  return tookDamage ? "hit" : "idle";
}

function isCharacterId(value) {
  return typeof value === "string" && CHARACTER_IDS.includes(value);
}

function powerIdFor(fighter) {
  return CHARACTER_POWERS[fighter?.characterId] ?? POWER_IDS.QUICKDRAW;
}

function powerNeedsTarget(powerId) {
  return (
    powerId === POWER_IDS.QUICKDRAW ||
    powerId === POWER_IDS.MIRROR ||
    powerId === POWER_IDS.DOUSE ||
    powerId === POWER_IDS.STICKY_FINGERS ||
    powerId === POWER_IDS.JUMBLE
  );
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

function resolveTurn(fighters, selections, random = Math.random) {
  const active = fighters.filter((fighter) => fighter.alive);
  const events = [];
  const damage = new Map();
  const blockedShots = new Map();
  const reloaded = new Set();
  const dousedAtStart = new Map(
    active.map((fighter) => [fighter.id, Math.max(0, fighter.dousedTurns ?? 0)]),
  );
  const dousedByAtStart = new Map(
    active.map((fighter) => [fighter.id, fighter.dousedById ?? null]),
  );
  const newlyDoused = new Set();
  const ignitedDouse = new Set();
  const requestedActions = new Map(
    active.map((fighter) => [
      fighter.id,
      { ...(selections.get(fighter.id) ?? { type: ACTIONS.WAIT }) },
    ]),
  );
  const jumbleActorsByTarget = new Map();

  for (const circusFighter of active) {
    const requested = requestedActions.get(circusFighter.id);
    if (
      powerIdFor(circusFighter) !== POWER_IDS.JUMBLE ||
      requested.type !== ACTIONS.POWER
    ) {
      continue;
    }
    const target = resolvePowerTarget(
      circusFighter,
      fighters,
      requested.targetId,
    );
    const powerAction = {
      type: ACTIONS.POWER,
      powerId: POWER_IDS.JUMBLE,
      targetId: target?.id ?? null,
    };
    if (!target || !canUsePower(circusFighter, fighters, powerAction)) continue;
    const actors = jumbleActorsByTarget.get(target.id) ?? [];
    actors.push(circusFighter.id);
    jumbleActorsByTarget.set(target.id, actors);
  }

  const normalized = new Map(
    active.map((fighter) => {
      const requested = requestedActions.get(fighter.id);
      let action = { ...requested };
      const fighterPowerId = powerIdFor(fighter);
      const jumbleActors = jumbleActorsByTarget.get(fighter.id);

      if (
        jumbleActors?.length &&
        [ACTIONS.BLOCK, ACTIONS.RELOAD, ACTIONS.FIRE].includes(action.type)
      ) {
        action = jumbledAction(fighter, action, active, jumbleActors, random);
      }

      if (
        fighterPowerId === POWER_IDS.CIVILIAN &&
        action.type !== ACTIONS.BLOCK &&
        action.type !== ACTIONS.POWER &&
        action.type !== ACTIONS.WAIT
      ) {
        action = preserveJumbleMetadata(action, ACTIONS.WAIT);
      }

      if (action.type === ACTIONS.FIRE && fighter.ammo < 1) {
        action = preserveJumbleMetadata(action, ACTIONS.WAIT);
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

    if (action.powerId === POWER_IDS.DOUSE) {
      const target = fighters.find(
        (candidate) => candidate.id === action.targetId && candidate.alive,
      );
      if (target) {
        target.dousedTurns = 2;
        target.dousedById = fighter.id;
        newlyDoused.add(target.id);
        events.push({
          type: "doused",
          actorId: fighter.id,
          targetId: target.id,
          turns: target.dousedTurns,
          powerId: action.powerId,
        });
      }
    }

    if (action.powerId === POWER_IDS.JUMBLE) {
      const targetAction = normalized.get(action.targetId);
      events.push({
        type: "jumbled",
        actorId: fighter.id,
        targetId: action.targetId,
        originalAction: targetAction?.jumbledFrom ?? null,
        resolvedAction: targetAction?.jumbledTo ?? null,
        originalTargetId: targetAction?.jumbledOriginalTargetId ?? null,
        resolvedTargetId: targetAction?.targetId ?? null,
        powerId: action.powerId,
      });
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
    const douseIgnites =
      (dousedAtStart.get(fighter.id) ?? 0) > 0 &&
      (action.type === ACTIONS.FIRE ||
        (action.type === ACTIONS.POWER &&
          (action.powerId === POWER_IDS.QUICKDRAW ||
            action.powerId === POWER_IDS.MANIAC)));

    if (douseIgnites) {
      addDamage(fighter.id, 1, {
        type: "douseIgnited",
        actorId: dousedByAtStart.get(fighter.id),
        targetId: fighter.id,
        attemptedAction: action.type,
        attemptedPowerId: action.powerId ?? null,
        powerId: POWER_IDS.DOUSE,
      });
      fighter.dousedTurns = 0;
      fighter.dousedById = null;
      ignitedDouse.add(fighter.id);
      continue;
    }

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

  const stickyClaims = new Map();
  for (const stickyFighter of active) {
    const action = normalized.get(stickyFighter.id);
    if (
      action.type !== ACTIONS.POWER ||
      action.powerId !== POWER_IDS.STICKY_FINGERS
    ) {
      continue;
    }
    const target = active.find((candidate) => candidate.id === action.targetId);
    if (!target) continue;
    const targetAction = normalized.get(target.id);
    const targetShootsSticky =
      (targetAction?.type === ACTIONS.FIRE &&
        targetAction.targetId === stickyFighter.id) ||
      (targetAction?.type === ACTIONS.POWER &&
        targetAction.powerId === POWER_IDS.QUICKDRAW &&
        targetAction.targetId === stickyFighter.id) ||
      (targetAction?.type === ACTIONS.POWER &&
        targetAction.powerId === POWER_IDS.MANIAC);
    if (targetShootsSticky) {
      events.push({
        type: "bulletsStolen",
        actorId: stickyFighter.id,
        targetId: target.id,
        amount: 0,
        reason: "shotAtThief",
        powerId: action.powerId,
      });
      continue;
    }
    const claimants = stickyClaims.get(target.id) ?? [];
    claimants.push(stickyFighter);
    stickyClaims.set(target.id, claimants);
  }

  const ammoBeforeTheft = new Map(
    active.map((fighter) => [fighter.id, Math.max(0, fighter.ammo ?? 0)]),
  );
  const ammoDeltas = new Map(active.map((fighter) => [fighter.id, 0]));
  for (const [targetId, claimants] of stickyClaims) {
    const target = active.find((candidate) => candidate.id === targetId);
    const targetAction = normalized.get(targetId);
    const available = ammoBeforeTheft.get(targetId) ?? 0;
    const stolenTotal =
      targetAction?.type === ACTIONS.BLOCK
        ? Math.ceil(available / 2)
        : available;
    ammoDeltas.set(targetId, (ammoDeltas.get(targetId) ?? 0) - stolenTotal);
    const evenShare = Math.floor(stolenTotal / claimants.length);
    const remainder = stolenTotal % claimants.length;
    claimants.forEach((stickyFighter, index) => {
      const amount = evenShare + (index < remainder ? 1 : 0);
      ammoDeltas.set(
        stickyFighter.id,
        (ammoDeltas.get(stickyFighter.id) ?? 0) + amount,
      );
      events.push({
        type: "bulletsStolen",
        actorId: stickyFighter.id,
        targetId: target.id,
        amount,
        reason: available > 0 ? "stolen" : "empty",
        targetAction: targetAction?.type ?? ACTIONS.WAIT,
        powerId: POWER_IDS.STICKY_FINGERS,
      });
    });
  }
  for (const fighter of active) {
    fighter.ammo = Math.max(
      0,
      (ammoBeforeTheft.get(fighter.id) ?? 0) + (ammoDeltas.get(fighter.id) ?? 0),
    );
  }

  for (const fighter of active) {
    fighter.lastAction = normalized.get(fighter.id).type;
    if (
      !newlyDoused.has(fighter.id) &&
      !ignitedDouse.has(fighter.id) &&
      (dousedAtStart.get(fighter.id) ?? 0) > 0
    ) {
      fighter.dousedTurns = Math.max(0, (dousedAtStart.get(fighter.id) ?? 0) - 1);
      if (fighter.dousedTurns === 0) fighter.dousedById = null;
    }
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
      fighter.dousedTurns = 0;
      fighter.dousedById = null;
      if (powerIdFor(fighter) === POWER_IDS.CIVILIAN) fighter.powerUses = 0;
      events.push({ type: "eliminated", actorId: fighter.id });
    }
  }

  if (!fighters.some((fighter) => fighter.alive)) {
    for (const fighter of active) {
      fighter.hearts = 1;
      fighter.alive = true;
      fighter.hardened = false;
      fighter.dousedTurns = 0;
      fighter.dousedById = null;
      if (powerIdFor(fighter) === POWER_IDS.CIVILIAN) fighter.powerUses = 0;
    }
    events.push({ type: "lastStand" });
  }

  const civilianWinners = fighters.filter(
    (fighter) =>
      fighter.alive &&
      powerIdFor(fighter) === POWER_IDS.CIVILIAN &&
      fighter.powerUses >= CIVILIAN_POWER_GOAL,
  );
  for (const civilianWinner of civilianWinners) {
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
      powerId === POWER_IDS.MANIAC ||
      powerId === POWER_IDS.DOUSE ||
      powerId === POWER_IDS.STICKY_FINGERS ||
      powerId === POWER_IDS.JUMBLE;
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

function jumbledAction(fighter, action, active, actorIds, random) {
  const mapping = createJumbleMapping(random);
  const resolvedType = mapping[action.type];
  const metadata = {
    jumbledFrom: action.type,
    jumbledTo: resolvedType,
    jumbledByIds: [...actorIds],
    jumbledOriginalTargetId: action.targetId ?? null,
  };
  if (resolvedType !== ACTIONS.FIRE) {
    return { type: resolvedType, ...metadata };
  }
  const targets = active.filter((candidate) => candidate.id !== fighter.id);
  const target = targets[randomIndex(random, targets.length)] ?? null;
  return {
    type: ACTIONS.FIRE,
    targetId: target?.id ?? null,
    ...metadata,
  };
}

function createJumbleMapping(random = Math.random) {
  const outcomes = [ACTIONS.BLOCK, ACTIONS.RELOAD, ACTIONS.FIRE];
  return Object.fromEntries(
    outcomes.map((button) => [
      button,
      outcomes[randomIndex(random, outcomes.length)],
    ]),
  );
}

function randomIndex(random, length) {
  if (length < 1) return 0;
  const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
  return Math.floor(roll * length);
}

function preserveJumbleMetadata(action, type) {
  if (!action?.jumbledFrom) return { type };
  return {
    type,
    jumbledFrom: action.jumbledFrom,
    jumbledTo: action.jumbledTo,
    jumbledByIds: action.jumbledByIds,
    jumbledOriginalTargetId: action.jumbledOriginalTargetId ?? null,
  };
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

export {
  ACTIONS,
  CHARACTER_IDS,
  CIVILIAN_POWER_GOAL,
  POWER_IDS,
  canUsePower,
  chooseRobotAction,
  createJumbleMapping,
  createFighter,
  isCharacterId,
  outcomePoseFor,
  powerIdFor,
  powerNeedsTarget,
  resolveTurn,
};

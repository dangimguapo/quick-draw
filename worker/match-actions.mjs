import {
  ACTIONS,
  POWER_IDS,
  canUsePower,
  powerIdFor,
  powerNeedsTarget,
} from "../public/src/engine.mjs";

function validateMatchAction(
  fighter,
  fighters,
  action,
  { allowPower = true } = {},
) {
  if (action.type === ACTIONS.POWER) {
    if (!allowPower) {
      return {
        ok: false,
        code: "power_unavailable",
        message: "Choose block, reload, or fire during the frozen response.",
      };
    }

    const powerId = powerIdFor(fighter);
    let target = null;
    if (powerNeedsTarget(powerId)) {
      target = fighters.find(
        (candidate) =>
          candidate.id === action.targetId &&
          candidate.id !== fighter.id &&
          candidate.alive,
      );
      if (!target) {
        return {
          ok: false,
          code: "invalid_target",
          message: "Choose a living opponent for that power.",
        };
      }
    }

    const powerAction = {
      type: ACTIONS.POWER,
      ...(target ? { targetId: target.id } : {}),
    };
    if (!canUsePower(fighter, fighters, powerAction)) {
      const powerUsed =
        powerId !== POWER_IDS.CIVILIAN && fighter.powerUsed;
      return {
        ok: false,
        code: "power_unavailable",
        message: powerUsed
          ? "That special power was already used this duel."
          : powerId === POWER_IDS.MANIAC
            ? `Maniac needs ${fighters.filter((candidate) => candidate.alive).length} loaded shots.`
            : "That special power is not available right now.",
      };
    }

    return {
      ok: true,
      action: powerAction,
    };
  }

  if (
    fighter.characterId === "civilian" &&
    action.type !== ACTIONS.BLOCK &&
    action.type !== ACTIONS.WAIT
  ) {
    return {
      ok: false,
      code: "action_unavailable",
      message: "Civilian can only block or use their special power.",
    };
  }

  if (action.type === ACTIONS.FIRE) {
    if (fighter.ammo < 1) {
      return {
        ok: false,
        code: "no_ammo",
        message: "You do not have a loaded shot.",
      };
    }
    const target = fighters.find(
      (candidate) =>
        candidate.id === action.targetId &&
        candidate.id !== fighter.id &&
        candidate.alive,
    );
    if (!target) {
      return {
        ok: false,
        code: "invalid_target",
        message: "Choose a living opponent.",
      };
    }
    return {
      ok: true,
      action: { type: ACTIONS.FIRE, targetId: target.id },
    };
  }

  if (
    action.type === ACTIONS.BLOCK ||
    action.type === ACTIONS.RELOAD ||
    action.type === ACTIONS.WAIT
  ) {
    return { ok: true, action: { type: action.type } };
  }

  return {
    ok: false,
    code: "invalid_action",
    message: "That action is not available.",
  };
}

export { validateMatchAction };

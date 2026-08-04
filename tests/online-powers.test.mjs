import assert from "node:assert/strict";
import {
  ACTIONS,
  CHARACTER_IDS,
  createFighter,
} from "../public/src/engine.mjs";
import { validateMatchAction } from "../worker/match-actions.mjs";
import { playerSafeBeatResult } from "../worker/player-safe-result.mjs";

function fighter(id, characterId) {
  return createFighter({
    id,
    name: id,
    characterId,
  });
}

for (const characterId of CHARACTER_IDS) {
  const player = fighter(characterId, characterId);
  const rival = fighter(`${characterId}-rival`, "sheriff");
  const fighters = [player, rival];
  const action = {
    type: ACTIONS.POWER,
    ...(["quickdraw", "mirror", "arsonist", "sticky-fingers", "circus-freak"].includes(characterId)
      ? { targetId: rival.id }
      : {}),
  };
  if (characterId === "maniac") player.ammo = fighters.length;

  const accepted = validateMatchAction(player, fighters, action);
  assert.equal(
    accepted.ok,
    true,
    `${characterId} power should be accepted online when available`,
  );
}

{
  const quickdraw = fighter("quickdraw", "quickdraw");
  const rival = fighter("rival", "sheriff");
  const missingTarget = validateMatchAction(
    quickdraw,
    [quickdraw, rival],
    { type: ACTIONS.POWER },
  );
  assert.equal(missingTarget.ok, false);
  assert.equal(missingTarget.code, "invalid_target");

  quickdraw.powerUsed = true;
  const alreadyUsed = validateMatchAction(
    quickdraw,
    [quickdraw, rival],
    { type: ACTIONS.POWER, targetId: rival.id },
  );
  assert.equal(alreadyUsed.ok, false);
  assert.equal(alreadyUsed.code, "power_unavailable");
}

{
  const maniac = fighter("maniac", "maniac");
  const left = fighter("left", "sheriff");
  const right = fighter("right", "quickdraw");
  maniac.ammo = 2;
  const insufficientAmmo = validateMatchAction(
    maniac,
    [maniac, left, right],
    { type: ACTIONS.POWER },
  );
  assert.equal(insufficientAmmo.ok, false);
  assert.match(insufficientAmmo.message, /needs 3 loaded shots/i);
}

{
  const freeze = fighter("freeze", "time-freeze");
  const rival = fighter("rival", "quickdraw");
  const frozenPower = validateMatchAction(
    freeze,
    [freeze, rival],
    { type: ACTIONS.POWER },
    { allowPower: false },
  );
  assert.equal(frozenPower.ok, false);
  assert.equal(frozenPower.code, "power_unavailable");
}

{
  const civilian = fighter("civilian", "civilian");
  const rival = fighter("rival", "sheriff");
  const invalidReload = validateMatchAction(
    civilian,
    [civilian, rival],
    { type: ACTIONS.RELOAD },
  );
  assert.equal(invalidReload.ok, false);
  assert.equal(invalidReload.code, "action_unavailable");
}

{
  const result = {
    events: [
      {
        type: "bulletsStolen",
        actorId: "sticky",
        targetId: "victim",
        amount: 4,
      },
    ],
  };
  assert.equal(
    playerSafeBeatResult(result, "sticky").events[0].amount,
    4,
    "Sticky sees the exact number of stolen bullets",
  );
  assert.equal(
    playerSafeBeatResult(result, "victim").events[0].amount,
    4,
    "The victim sees the exact number of stolen bullets",
  );
  assert.equal(
    "amount" in playerSafeBeatResult(result, "observer").events[0],
    false,
    "Unrelated players cannot infer a rival's private ammunition",
  );
}

console.log("All ten online power policies passed.");

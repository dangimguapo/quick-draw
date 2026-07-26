const assert = require("node:assert/strict");

global.window = global;
require("../public/src/engine.js");

const {
  ACTIONS,
  CIVILIAN_POWER_GOAL,
  canUsePower,
  createFighter,
  outcomePoseFor,
  resolveTurn,
} = global.QuickDrawEngine;

function fighter(id, characterId) {
  return createFighter({
    id,
    name: id,
    color: "#fff",
    avatar: id[0],
    characterId,
  });
}

function selections(entries) {
  return new Map(entries);
}

{
  assert.equal(
    outcomePoseFor({ type: ACTIONS.RELOAD }, true),
    ACTIONS.RELOAD,
    "A selected action pose takes priority over incoming damage",
  );
  assert.equal(
    outcomePoseFor({ type: ACTIONS.WAIT }, true),
    "hit",
    "A damaging no-action result uses the hit pose",
  );
  assert.equal(
    outcomePoseFor({ type: ACTIONS.WAIT }, false),
    "idle",
    "A harmless no-action result uses the idle pose",
  );
}

{
  const quickdraw = fighter("quickdraw", "quickdraw");
  const rival = fighter("rival", "sheriff");
  resolveTurn(
    [quickdraw, rival],
    selections([
      [quickdraw.id, { type: ACTIONS.POWER, targetId: rival.id }],
      [rival.id, { type: ACTIONS.RELOAD }],
    ]),
  );
  assert.equal(quickdraw.ammo, 0, "Quickdraw reloads and fires with no net ammo cost");
  assert.equal(rival.hearts, 2, "Quickdraw can fire on the opening beat");
}

{
  const boulder = fighter("boulder", "body-boulder");
  const rival = fighter("rival", "sheriff");
  resolveTurn(
    [boulder, rival],
    selections([
      [boulder.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(boulder.hearts, 4, "Harden grants a fourth heart");
  assert.equal(boulder.hardened, true);

  rival.ammo = 1;
  const result = resolveTurn(
    [boulder, rival],
    selections([
      [boulder.id, { type: ACTIONS.WAIT }],
      [rival.id, { type: ACTIONS.FIRE, targetId: boulder.id }],
    ]),
  );
  assert.equal(boulder.hearts, 3, "The stone heart absorbs the first damage");
  assert.equal(boulder.hardened, false, "Harden breaks when hit");
  assert.ok(result.events.some((event) => event.type === "stoneShattered"));
}

{
  const sheriff = fighter("sheriff", "sheriff");
  const rival = fighter("rival", "quickdraw");
  resolveTurn(
    [sheriff, rival],
    selections([
      [sheriff.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(sheriff.ammo, 6, "6 in the Chamber loads six bullets");
}

{
  const mirror = fighter("mirror", "mirror");
  const shooter = fighter("shooter", "sheriff");
  shooter.ammo = 1;
  const result = resolveTurn(
    [mirror, shooter],
    selections([
      [mirror.id, { type: ACTIONS.POWER, targetId: shooter.id }],
      [shooter.id, { type: ACTIONS.FIRE, targetId: mirror.id }],
    ]),
  );
  assert.equal(mirror.hearts, 3, "Mirror avoids the copied outlaw's shot");
  assert.equal(shooter.hearts, 2, "Mirror reflects that shot back");
  assert.ok(result.events.some((event) => event.type === "reflected"));

  const copyingMirror = fighter("copy", "mirror");
  const reloader = fighter("reloader", "sheriff");
  resolveTurn(
    [copyingMirror, reloader],
    selections([
      [copyingMirror.id, { type: ACTIONS.POWER, targetId: reloader.id }],
      [reloader.id, { type: ACTIONS.RELOAD }],
    ]),
  );
  assert.equal(copyingMirror.ammo, 1, "Mirror copies a targeted reload");
}

{
  const freeze = fighter("freeze", "time-freeze");
  const rival = fighter("rival", "quickdraw");
  resolveTurn(
    [freeze, rival],
    selections([
      [freeze.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.BLOCK }],
    ]),
  );
  assert.equal(freeze.powerUsed, true, "Time Freeze consumes its once-per-duel charge");
}

{
  const maniac = fighter("maniac", "maniac");
  const left = fighter("left", "sheriff");
  const right = fighter("right", "quickdraw");
  maniac.ammo = 3;
  assert.equal(canUsePower(maniac, [maniac, left, right]), true);
  resolveTurn(
    [maniac, left, right],
    selections([
      [maniac.id, { type: ACTIONS.POWER }],
      [left.id, { type: ACTIONS.WAIT }],
      [right.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(maniac.ammo, 0, "Maniac spends one bullet per living duelist");
  assert.equal(left.hearts, 2, "Maniac shoots the left rival");
  assert.equal(right.hearts, 2, "Maniac shoots the right rival");

  const blockedManiac = fighter("wild", "maniac");
  const blockerOne = fighter("blocker-one", "sheriff");
  const blockerTwo = fighter("blocker-two", "quickdraw");
  blockedManiac.ammo = 3;
  const result = resolveTurn(
    [blockedManiac, blockerOne, blockerTwo],
    selections([
      [blockedManiac.id, { type: ACTIONS.POWER }],
      [blockerOne.id, { type: ACTIONS.BLOCK }],
      [blockerTwo.id, { type: ACTIONS.BLOCK }],
    ]),
  );
  assert.equal(blockedManiac.alive, false, "Maniac's final bullet hits himself if all rivals block");
  assert.ok(result.events.some((event) => event.type === "wildBackfire"));
}

{
  const civilian = fighter("civilian", "civilian");
  const rival = fighter("rival", "sheriff");
  assert.equal(civilian.hearts, 1, "Civilian starts with one heart");

  for (let use = 1; use < CIVILIAN_POWER_GOAL; use += 1) {
    const result = resolveTurn(
      [civilian, rival],
      selections([
        [civilian.id, { type: ACTIONS.POWER }],
        [rival.id, { type: ACTIONS.BLOCK }],
      ]),
    );
    assert.equal(civilian.powerUses, use);
    assert.equal(civilian.powerUsed, false, "Survive remains repeatable");
    assert.equal(
      result.events.some((event) => event.type === "civilianVictory"),
      false,
      "Civilian cannot win before the fifth use",
    );
  }

  const winningResult = resolveTurn(
    [civilian, rival],
    selections([
      [civilian.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.BLOCK }],
    ]),
  );
  assert.equal(civilian.powerUses, CIVILIAN_POWER_GOAL);
  assert.equal(canUsePower(civilian, [civilian, rival]), false);
  assert.ok(
    winningResult.events.some(
      (event) => event.type === "civilianVictory" && event.actorId === civilian.id,
    ),
    "Civilian wins after surviving the fifth use",
  );

  const exposedCivilian = fighter("exposed-civilian", "civilian");
  const shooter = fighter("shooter", "sheriff");
  exposedCivilian.powerUses = CIVILIAN_POWER_GOAL - 1;
  shooter.ammo = 1;
  const lethalResult = resolveTurn(
    [exposedCivilian, shooter],
    selections([
      [exposedCivilian.id, { type: ACTIONS.POWER }],
      [shooter.id, { type: ACTIONS.FIRE, targetId: exposedCivilian.id }],
    ]),
  );
  assert.equal(exposedCivilian.alive, false, "Civilian dies to one unblocked shot");
  assert.equal(exposedCivilian.powerUses, 0, "Civilian loses all progress when eliminated");
  assert.equal(
    lethalResult.events.some((event) => event.type === "civilianVictory"),
    false,
    "The fifth use does not win if Civilian dies during that beat",
  );

  const unarmedCivilian = fighter("unarmed-civilian", "civilian");
  const target = fighter("target", "sheriff");
  unarmedCivilian.ammo = 1;
  const invalidFire = resolveTurn(
    [unarmedCivilian, target],
    selections([
      [unarmedCivilian.id, { type: ACTIONS.FIRE, targetId: target.id }],
      [target.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(invalidFire.selections.get(unarmedCivilian.id).type, ACTIONS.WAIT);
  assert.equal(target.hearts, 3, "Civilian cannot fire even if given ammunition");
}

console.log("All seven redesigned Quick Draw powers passed.");

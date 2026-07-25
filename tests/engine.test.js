const assert = require("node:assert/strict");

global.window = global;
require("../src/engine.js");

const { ACTIONS, canUsePower, createFighter, resolveTurn } = global.QuickDrawEngine;

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
  const knight = fighter("knight", "sir-blocksalot");
  const rival = fighter("rival", "chuck-reloadington");
  rival.ammo = 2;

  let result = resolveTurn(
    [knight, rival],
    selections([
      [knight.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.FIRE, targetId: knight.id }],
    ]),
  );
  assert.equal(knight.hearts, 3, "Double Shield blocks on its activation beat");
  assert.equal(knight.shieldCarry, 1, "Double Shield carries into the next beat");
  assert.equal(result.blockedShots.get(knight.id), 1);

  result = resolveTurn(
    [knight, rival],
    selections([
      [knight.id, { type: ACTIONS.WAIT }],
      [rival.id, { type: ACTIONS.FIRE, targetId: knight.id }],
    ]),
  );
  assert.equal(knight.hearts, 3, "Double Shield blocks the following beat");
  assert.equal(knight.shieldCarry, 0);
}

{
  const chuck = fighter("chuck", "chuck-reloadington");
  const rival = fighter("rival", "sir-blocksalot");
  resolveTurn(
    [chuck, rival],
    selections([
      [chuck.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(chuck.ammo, 2, "Fast Hands loads two shots");
}

{
  const peeka = fighter("peeka", "peeka-boo");
  const rival = fighter("rival", "sir-blocksalot");
  rival.ammo = 1;
  resolveTurn(
    [peeka, rival],
    selections([
      [peeka.id, { type: ACTIONS.POWER, targetId: rival.id }],
      [rival.id, { type: ACTIONS.FIRE, targetId: peeka.id }],
    ]),
  );
  assert.equal(peeka.hearts, 2, "Peek leaves its user exposed");
  assert.equal(peeka.powerUsed, true);
}

{
  const rita = fighter("rita", "ricochet-rita");
  const blocker = fighter("blocker", "sir-blocksalot");
  const bystander = fighter("bystander", "peeka-boo");
  rita.ammo = 1;
  const result = resolveTurn(
    [rita, blocker, bystander],
    selections([
      [rita.id, { type: ACTIONS.POWER, targetId: blocker.id }],
      [blocker.id, { type: ACTIONS.BLOCK }],
      [bystander.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(rita.ammo, 0, "Bounce costs one shot");
  assert.equal(blocker.hearts, 3, "The original blocker takes no damage");
  assert.equal(bystander.hearts, 2, "The blocked shot ricochets to the third fighter");
  assert.ok(result.events.some((event) => event.type === "ricochet"));
}

{
  const nurse = fighter("nurse", "nurse-nudge");
  const rival = fighter("rival", "sir-blocksalot");
  nurse.hearts = 2;
  resolveTurn(
    [nurse, rival],
    selections([
      [nurse.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(nurse.hearts, 3, "Patch Up restores one heart");
}

{
  const sam = fighter("sam", "sticky-sam");
  const rival = fighter("rival", "sir-blocksalot");
  const eliminated = fighter("eliminated", "chuck-reloadington");
  eliminated.alive = false;
  assert.equal(
    canUsePower(sam, [sam, rival, eliminated], {
      type: ACTIONS.POWER,
      targetId: eliminated.id,
    }),
    false,
    "Jam cannot silently retarget from an eliminated rival",
  );

  resolveTurn(
    [sam, rival, eliminated],
    selections([
      [sam.id, { type: ACTIONS.POWER, targetId: rival.id }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(rival.jammedTurns, 1, "Jam marks the rival's next beat");
  assert.equal(
    canUsePower(sam, [sam, rival, eliminated], {
      type: ACTIONS.POWER,
      targetId: rival.id,
    }),
    false,
    "Using either Jam target consumes the shared power charge",
  );

  const result = resolveTurn(
    [sam, rival],
    selections([
      [sam.id, { type: ACTIONS.WAIT }],
      [rival.id, { type: ACTIONS.RELOAD }],
    ]),
  );
  assert.equal(rival.ammo, 0, "A jammed reload adds no ammunition");
  assert.equal(rival.jammedTurns, 0, "Jam expires after the affected beat");
  assert.ok(result.events.some((event) => event.type === "jammed"));
}

console.log("All six Quick Draw powers passed.");

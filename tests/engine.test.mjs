import assert from "node:assert/strict";
import {
  ACTIONS,
  CHARACTER_IDS,
  CIVILIAN_POWER_GOAL,
  canUsePower,
  createJumbleMapping,
  createFighter,
  isCharacterId,
  outcomePoseFor,
  resolveTurn,
} from "../public/src/engine.mjs";

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
  assert.equal(CHARACTER_IDS.length, 10, "The shared roster exposes all playable fighters");
  assert.equal(isCharacterId("quickdraw"), true);
  assert.equal(isCharacterId("unknown"), false);
}

{
  const arsonist = fighter("arsonist", "arsonist");
  const target = fighter("target", "sheriff");
  target.ammo = 2;

  const douseResult = resolveTurn(
    [arsonist, target],
    selections([
      [arsonist.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.FIRE, targetId: arsonist.id }],
    ]),
  );
  assert.equal(arsonist.hearts, 2, "Douse begins after the beat in which it is applied");
  assert.equal(target.dousedTurns, 2, "Douse covers the target's next two beats");
  assert.equal(arsonist.powerUsed, true, "Douse consumes its once-per-duel charge");
  assert.equal(canUsePower(arsonist, [arsonist, target]), false);
  assert.ok(douseResult.events.some((event) => event.type === "doused"));

  resolveTurn(
    [arsonist, target],
    selections([
      [arsonist.id, { type: ACTIONS.BLOCK }],
      [target.id, { type: ACTIONS.BLOCK }],
    ]),
  );
  assert.equal(target.dousedTurns, 1, "A safe action advances the Douse timer");

  const ignitionResult = resolveTurn(
    [arsonist, target],
    selections([
      [arsonist.id, { type: ACTIONS.WAIT }],
      [target.id, { type: ACTIONS.FIRE, targetId: arsonist.id }],
    ]),
  );
  assert.equal(target.hearts, 2, "Shooting while doused costs the shooter one heart");
  assert.equal(target.ammo, 1, "An ignited shot is canceled without spending its bullet");
  assert.equal(arsonist.hearts, 2, "The canceled shot never reaches its target");
  assert.equal(target.dousedTurns, 0, "Ignition burns off the gasoline");
  assert.ok(
    ignitionResult.events.some(
      (event) => event.type === "douseIgnited" && event.targetId === target.id,
    ),
  );
}

{
  const arsonist = fighter("arsonist", "arsonist");
  const maniac = fighter("maniac", "maniac");
  const rival = fighter("rival", "sheriff");
  maniac.ammo = 3;
  maniac.dousedTurns = 2;
  maniac.dousedById = arsonist.id;

  const result = resolveTurn(
    [arsonist, maniac, rival],
    selections([
      [arsonist.id, { type: ACTIONS.BLOCK }],
      [maniac.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );
  assert.equal(maniac.hearts, 2, "A doused Maniac ignites when using their shooting power");
  assert.equal(maniac.ammo, 3, "The canceled Maniac power does not spend ammunition");
  assert.equal(arsonist.hearts, 3, "Maniac's canceled power does not hit Arsonist");
  assert.equal(rival.hearts, 3, "Maniac's canceled power does not hit another rival");
  assert.equal(maniac.powerUsed, true, "The attempted Maniac power is still consumed");
  assert.ok(result.events.some((event) => event.type === "douseIgnited"));
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const target = fighter("target", "sheriff");
  sticky.ammo = 1;
  target.ammo = 2;

  const result = resolveTurn(
    [sticky, target],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.RELOAD }],
    ]),
  );

  assert.equal(sticky.ammo, 4, "Sticky Fingers takes the newly reloaded bullet too");
  assert.equal(target.ammo, 0, "A reloading target is left with no bullets");
  assert.equal(sticky.powerUsed, true, "Sticky Fingers is consumed once used");
  assert.ok(
    result.events.some(
      (event) =>
        event.type === "bulletsStolen" &&
        event.actorId === sticky.id &&
        event.amount === 3,
    ),
  );
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const target = fighter("target", "sheriff");
  target.ammo = 5;

  resolveTurn(
    [sticky, target],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.BLOCK }],
    ]),
  );

  assert.equal(sticky.ammo, 3, "Blocking only protects the rounded-down half");
  assert.equal(target.ammo, 2, "A blocking target keeps half of an odd ammo count");
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const target = fighter("target", "sheriff");
  target.ammo = 1;

  resolveTurn(
    [sticky, target],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.BLOCK }],
    ]),
  );

  assert.equal(sticky.ammo, 1, "Sticky Fingers takes a lone bullet through a block");
  assert.equal(target.ammo, 0);
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const shooter = fighter("shooter", "sheriff");
  shooter.ammo = 3;

  const result = resolveTurn(
    [sticky, shooter],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: shooter.id }],
      [shooter.id, { type: ACTIONS.FIRE, targetId: sticky.id }],
    ]),
  );

  assert.equal(shooter.ammo, 2, "Shooting Sticky only spends the fired bullet");
  assert.equal(sticky.ammo, 0, "A target shooting Sticky prevents the theft");
  assert.equal(sticky.hearts, 2, "The target's shot still lands normally");
  assert.ok(
    result.events.some(
      (event) =>
        event.type === "bulletsStolen" &&
        event.amount === 0 &&
        event.reason === "shotAtThief",
    ),
  );
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const shooter = fighter("shooter", "sheriff");
  const rival = fighter("rival", "quickdraw");
  shooter.ammo = 3;

  resolveTurn(
    [sticky, shooter, rival],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: shooter.id }],
      [shooter.id, { type: ACTIONS.FIRE, targetId: rival.id }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );

  assert.equal(sticky.ammo, 2, "Sticky steals the ammunition left after a shot at somebody else");
  assert.equal(shooter.ammo, 0);
  assert.equal(rival.hearts, 2);
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const sheriff = fighter("sheriff", "sheriff");
  sheriff.ammo = 2;

  resolveTurn(
    [sticky, sheriff],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: sheriff.id }],
      [sheriff.id, { type: ACTIONS.POWER }],
    ]),
  );

  assert.equal(sticky.ammo, 8, "Sticky steals all six Sheriff power bullets plus existing ammo");
  assert.equal(sheriff.ammo, 0);
}

{
  const sticky = fighter("sticky", "sticky-fingers");
  const maniac = fighter("maniac", "maniac");
  const rival = fighter("rival", "sheriff");
  maniac.ammo = 3;

  const result = resolveTurn(
    [sticky, maniac, rival],
    selections([
      [sticky.id, { type: ACTIONS.POWER, targetId: maniac.id }],
      [maniac.id, { type: ACTIONS.POWER }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
  );

  assert.equal(sticky.ammo, 0, "Maniac's special shoots Sticky and prevents theft");
  assert.equal(maniac.ammo, 0, "Maniac still spends the special's required ammunition");
  assert.equal(sticky.hearts, 2);
  assert.ok(
    result.events.some(
      (event) =>
        event.type === "bulletsStolen" && event.reason === "shotAtThief",
    ),
  );
}

{
  const leftSticky = fighter("left-sticky", "sticky-fingers");
  const rightSticky = fighter("right-sticky", "sticky-fingers");
  const target = fighter("target", "sheriff");
  target.ammo = 5;

  resolveTurn(
    [leftSticky, rightSticky, target],
    selections([
      [leftSticky.id, { type: ACTIONS.POWER, targetId: target.id }],
      [rightSticky.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.WAIT }],
    ]),
  );

  assert.equal(leftSticky.ammo, 3, "Duplicate Sticky Fingers split an odd theft fairly");
  assert.equal(rightSticky.ammo, 2);
  assert.equal(target.ammo, 0);
}

{
  assert.deepEqual(
    createJumbleMapping(() => 0.99),
    {
      [ACTIONS.BLOCK]: ACTIONS.FIRE,
      [ACTIONS.RELOAD]: ACTIONS.FIRE,
      [ACTIONS.FIRE]: ACTIONS.FIRE,
    },
    "All three Jumble buttons may become Fire",
  );
  assert.deepEqual(
    createJumbleMapping(() => 0),
    {
      [ACTIONS.BLOCK]: ACTIONS.BLOCK,
      [ACTIONS.RELOAD]: ACTIONS.BLOCK,
      [ACTIONS.FIRE]: ACTIONS.BLOCK,
    },
    "All three Jumble buttons may become Block",
  );
  assert.deepEqual(
    createJumbleMapping(() => 0.5),
    {
      [ACTIONS.BLOCK]: ACTIONS.RELOAD,
      [ACTIONS.RELOAD]: ACTIONS.RELOAD,
      [ACTIONS.FIRE]: ACTIONS.RELOAD,
    },
    "All three Jumble buttons may become Reload",
  );
}

{
  const circus = fighter("circus", "circus-freak");
  const target = fighter("target", "sheriff");
  target.ammo = 1;

  const result = resolveTurn(
    [circus, target],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.FIRE, targetId: circus.id }],
    ]),
    () => 0,
  );

  assert.equal(result.selections.get(target.id).type, ACTIONS.BLOCK);
  assert.equal(result.selections.get(target.id).jumbledFrom, ACTIONS.FIRE);
  assert.equal(target.ammo, 1, "A Fire button jumbled into Block spends no bullet");
  assert.equal(circus.hearts, 3, "The jumbled shot becomes a real block");
  assert.equal(circus.powerUsed, true, "Jumble consumes its once-per-duel use");
}

{
  const circus = fighter("circus", "circus-freak");
  const target = fighter("target", "sheriff");
  const rival = fighter("rival", "quickdraw");
  target.ammo = 1;
  const rolls = [0, 0.99, 0, 0.99];

  const result = resolveTurn(
    [circus, target, rival],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.RELOAD }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
    () => rolls.shift() ?? 0,
  );

  const resolved = result.selections.get(target.id);
  assert.equal(resolved.type, ACTIONS.FIRE);
  assert.equal(resolved.jumbledFrom, ACTIONS.RELOAD);
  assert.equal(resolved.targetId, rival.id, "A generated shot picks a living rival");
  assert.equal(target.ammo, 0, "The generated shot spends exactly one bullet");
  assert.equal(rival.hearts, 2, "The randomly targeted shot resolves normally");
}

{
  const circus = fighter("circus", "circus-freak");
  const target = fighter("target", "sheriff");
  const rival = fighter("rival", "quickdraw");
  target.ammo = 1;
  const rolls = [0.99, 0.99, 0.99, 0.99];

  const result = resolveTurn(
    [circus, target, rival],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.FIRE, targetId: circus.id }],
      [rival.id, { type: ACTIONS.WAIT }],
    ]),
    () => rolls.shift() ?? 0,
  );

  const resolved = result.selections.get(target.id);
  assert.equal(resolved.type, ACTIONS.FIRE, "A Fire button may remain Fire");
  assert.equal(resolved.jumbledOriginalTargetId, circus.id);
  assert.equal(resolved.targetId, rival.id, "Jumble rerolls the victim of every Fire result");
  assert.equal(circus.hearts, 3);
  assert.equal(rival.hearts, 2);
}

{
  const circus = fighter("circus", "circus-freak");
  const target = fighter("target", "sheriff");
  target.ammo = 1;
  const rolls = [0.9, 0];

  const result = resolveTurn(
    [circus, target],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.BLOCK }],
    ]),
    () => rolls.shift() ?? 0,
  );

  assert.equal(result.selections.get(target.id).type, ACTIONS.FIRE);
  assert.equal(circus.hearts, 2, "A Block button jumbled into Fire can hit Circus Freak");
  assert.equal(target.ammo, 0);
}

{
  const circus = fighter("circus", "circus-freak");
  const target = fighter("target", "sheriff");

  const result = resolveTurn(
    [circus, target],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: target.id }],
      [target.id, { type: ACTIONS.POWER }],
    ]),
    () => 0,
  );

  assert.equal(result.selections.get(target.id).type, ACTIONS.POWER);
  assert.equal(target.ammo, 6, "Jumble leaves special-power buttons untouched");
}

{
  const circus = fighter("circus", "circus-freak");
  const civilian = fighter("civilian", "civilian");
  const rolls = [0.9, 0];

  const result = resolveTurn(
    [circus, civilian],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: civilian.id }],
      [civilian.id, { type: ACTIONS.BLOCK }],
    ]),
    () => rolls.shift() ?? 0,
  );

  assert.equal(
    result.selections.get(civilian.id).type,
    ACTIONS.WAIT,
    "Jumble cannot give the Civilian a forbidden firearm action",
  );
  assert.equal(result.selections.get(civilian.id).jumbledTo, ACTIONS.FIRE);
}

{
  const circus = fighter("circus", "circus-freak");
  const unarmedTarget = fighter("target", "sheriff");
  const rolls = [0.9, 0];

  const result = resolveTurn(
    [circus, unarmedTarget],
    selections([
      [circus.id, { type: ACTIONS.POWER, targetId: unarmedTarget.id }],
      [unarmedTarget.id, { type: ACTIONS.BLOCK }],
    ]),
    () => rolls.shift() ?? 0,
  );

  assert.equal(
    result.selections.get(unarmedTarget.id).type,
    ACTIONS.WAIT,
    "A jumbled Fire without ammunition becomes no move",
  );
  assert.equal(unarmedTarget.ammo, 0);
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
  const left = fighter("left", "sheriff");
  const right = fighter("right", "quickdraw");
  left.hearts = 1;
  right.hearts = 1;
  left.ammo = 5;
  right.ammo = 7;

  const result = resolveTurn(
    [left, right],
    selections([
      [left.id, { type: ACTIONS.FIRE, targetId: right.id }],
      [right.id, { type: ACTIONS.FIRE, targetId: left.id }],
    ]),
  );

  assert.ok(
    result.events.some((event) => event.type === "lastStand"),
    "A mutual knockout should continue as a last stand",
  );
  assert.equal(left.ammo, 4, "The left fighter spends only the bullet they fired");
  assert.equal(right.ammo, 6, "The right fighter spends only the bullet they fired");
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

{
  const leftCivilian = fighter("left-civilian", "civilian");
  const rightCivilian = fighter("right-civilian", "civilian");
  leftCivilian.powerUses = CIVILIAN_POWER_GOAL - 1;
  rightCivilian.powerUses = CIVILIAN_POWER_GOAL - 1;

  const sharedVictory = resolveTurn(
    [leftCivilian, rightCivilian],
    selections([
      [leftCivilian.id, { type: ACTIONS.POWER }],
      [rightCivilian.id, { type: ACTIONS.POWER }],
    ]),
  );
  const winners = sharedVictory.events
    .filter((event) => event.type === "civilianVictory")
    .map((event) => event.actorId);
  assert.deepEqual(
    winners,
    [leftCivilian.id, rightCivilian.id],
    "Civilians completing their goal together share the victory",
  );
}

console.log("All ten redesigned Quick Draw powers passed.");

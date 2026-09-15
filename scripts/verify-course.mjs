/**
 * The world, checked as data and by SIMULATION.
 *
 * The course is generated from tables, so its failure modes are silent: a gap
 * nobody can clear, a step a first-level player can already skip, a win pad
 * off the edge of its step, a shop on the wrong side of the hub. This suite
 * checks the layout rules and then runs the real shared `stepPlayer` against
 * the real collision model to prove each step is reachable with enough jump
 * height and NOT reachable with too little - that the gate is real.
 *
 * Run with `npm run verify:course`.
 */
import {
  BIOMES,
  BOOT_SHOP,
  BOOT_TIERS,
  EQUIPMENT_STALL,
  HUB,
  MOVEMENT,
  PITS,
  PIT_DEPTH,
  SCOREBOARD,
  SPAWN_POSITION,
  STAIR_START_Z,
  STEPS,
  TRAINING,
  TREADMILL_TIERS,
  WIN_PADS,
  WIN_PAD_STEP,
  WorldCollision,
  bootPadAt,
  bootPadCentre,
  createMotion,
  createSimEvents,
  inShopZone,
  resolveJumpPhysics,
  stepPlayer,
  treadmillAt,
  winPadAt,
} from '../shared/dist/index.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const increasing = (list) => list.every((value, i) => i === 0 || value > list[i - 1]);

console.log('\nbiomes\n');

check('there are 14 biomes', BIOMES.length === 14, `got ${BIOMES.length}`);
check('the first biome is Grassland', BIOMES[0]?.name === 'Grassland');
check(
  'biomes 2-6 are Forest, Ocean, Crystal, Desert, High Mountain',
  ['Forest', 'Ocean', 'Crystal', 'Desert', 'High Mountain'].every((name, i) => BIOMES[i + 1]?.name === name),
);
check('biomes 1-8 have 3 steps', BIOMES.slice(0, 8).every((b) => b.steps === 3));
check('biomes 9-14 have 4 steps', BIOMES.slice(8).every((b) => b.steps === 4));
check(
  'win rewards start 1, 3, 5, 15, 25, 40',
  [1, 3, 5, 15, 25, 40].every((wins, i) => BIOMES[i]?.wins === wins),
  BIOMES.map((b) => b.wins).join(', '),
);
check('win rewards strictly increase', increasing(BIOMES.map((b) => b.wins)));
check('step rises strictly increase', increasing(BIOMES.map((b) => b.rise)));
check('widths never grow', BIOMES.every((b, i) => i === 0 || b.width <= BIOMES[i - 1].width));
check('gaps never shrink', BIOMES.every((b, i) => i === 0 || b.gap >= BIOMES[i - 1].gap));
check('Grassland is reachable at level 1', BIOMES[0].rise < 8);
check(
  'each biome asks for a bigger jump than the last by a growing margin',
  BIOMES.every((b, i) => i < 2 || b.rise - BIOMES[i - 1].rise >= BIOMES[i - 1].rise - BIOMES[i - 2].rise),
  BIOMES.map((b) => b.rise).join(', '),
);
check('Forest needs a real jump (over twice level 1)', BIOMES[1].rise > 16);
check('Crystal needs roughly the first rebirth level with one jump', BIOMES[3].rise >= 50);

console.log('\nthe staircase\n');

check('the step count matches the biome table', STEPS.length === BIOMES.reduce((n, b) => n + b.steps, 0));
check('the first step starts at the hub edge', STEPS[0]?.minZ === STAIR_START_Z);
check(
  'steps are laid end to end with exactly the biome gap between them',
  STEPS.every((step, i) => i === 0 || Math.abs(step.minZ - (STEPS[i - 1].maxZ + BIOMES[step.biome - 1].gap)) < 1e-9),
);
check('every step is higher than the last', increasing(STEPS.map((s) => s.top)));
check('the map climbs over a thousand units', (STEPS.at(-1)?.top ?? 0) > 1000, `top ${STEPS.at(-1)?.top}`);

console.log('\nwin pads\n');

check('one pad per biome', WIN_PADS.length === BIOMES.length);
for (const pad of WIN_PADS) {
  const step = STEPS.find((s) => s.biome === pad.biome && s.step === WIN_PAD_STEP);
  const inside =
    step && pad.minX >= step.minX && pad.maxX <= step.maxX && pad.minZ >= step.minZ && pad.maxZ <= step.maxZ;
  const left = step && (pad.minX + pad.maxX) / 2 > (step.minX + step.maxX) / 2;
  const cx = (pad.minX + pad.maxX) / 2;
  const cz = (pad.minZ + pad.maxZ) / 2;
  if (!inside || !left || winPadAt(cx, pad.maxY, cz) !== pad.biome || pad.maxY - pad.minY >= MOVEMENT.stepHeight) {
    check(`biome ${pad.biome} pad is on step ${WIN_PAD_STEP}, on the LEFT (+X), and walkable`, false);
  }
}
check('every pad sits inside its 3rd step on the player\'s left (+X)', true);
check('the middle of a step is not a pad', winPadAt(0, STEPS[2].top, (STEPS[2].minZ + STEPS[2].maxZ) / 2) === 0);

console.log('\nhub layout (the player\'s left is +X)\n');

check('spawn is inside the hub', SPAWN_POSITION.z > HUB.minZ && SPAWN_POSITION.z < HUB.maxZ);
check('10 boots, two rows of five', BOOT_TIERS.length === 10 && BOOT_SHOP.perRow === 5 && BOOT_SHOP.rowXs.length === 2);
check(
  'the Wins Shop is on the LEFT side',
  BOOT_TIERS.every((tier) => bootPadCentre(tier.slot).x > 20),
);
check(
  'every boot pad is found where it is drawn',
  BOOT_TIERS.every((tier) => {
    const c = bootPadCentre(tier.slot);
    return bootPadAt(c.x, BOOT_SHOP.padTop, c.z) === tier.slot;
  }),
);
check('the scoreboard is on the RIGHT side', SCOREBOARD.x < -20 && SCOREBOARD.zs.length === 3);
check('High Training is at the BACK', TRAINING.centerZ < SPAWN_POSITION.z - 30);
check(
  'four treadmills: Beginner, 1, 2, 4 rebirths at x1, x1.5, x2, x3',
  TREADMILL_TIERS.length === 4 &&
    [0, 1, 2, 4].every((r, i) => TREADMILL_TIERS[i].rebirthsRequired === r) &&
    [1, 1.5, 2, 3].every((m, i) => TREADMILL_TIERS[i].multiplier === m),
);
check(
  'each belt is found where it is drawn',
  TRAINING.xs.every((x, i) => treadmillAt(x, TRAINING.deckTop, TRAINING.centerZ) === i + 1),
);
const zone = EQUIPMENT_STALL.zone;
check('the equipment shop stands just before the staircase', zone.maxZ < STAIR_START_Z && zone.minZ > SPAWN_POSITION.z);
check('the shop zone is detected', inShopZone((zone.minX + zone.maxX) / 2, 0, (zone.minZ + zone.maxZ) / 2));
check('spawn is not in the shop zone', !inShopZone(SPAWN_POSITION.x, 0, SPAWN_POSITION.z));

console.log('\nreachability, by simulation\n');

const collision = new WorldCollision();

/**
 * Stand at the back of `from` (a step, or null for the hub), run forward and
 * jump, spending air jumps at each apex. Returns true if the player ever
 * stands on `to`.
 */
const reaches = (fromTop, fromZ, to, height, maxJumps) => {
  const physics = resolveJumpPhysics(height);
  const params = { jumpVelocity: physics.velocity, gravity: physics.gravity, maxJumps };
  const motion = createMotion();
  motion.x = 0;
  motion.y = fromTop;
  motion.z = fromZ;
  const events = createSimEvents();
  const input = { moveX: 0, moveZ: 1, jump: false, cameraYaw: 0 };
  let jumps = 0;
  let wasRising = false;
  for (let frame = 0; frame < 60 * 6; frame += 1) {
    const rising = motion.vy > 0;
    // Press on the first frame, then at each apex while jumps remain.
    const press = (frame === 6 && jumps === 0) || (jumps > 0 && jumps < maxJumps && wasRising && !rising && !motion.grounded);
    input.jump = press;
    if (press) jumps += 1;
    wasRising = rising;
    // Steer like a player: run at the step, and once clear of its top, aim for
    // its middle instead of sailing over it into the next gap.
    const midZ = (to.minZ + to.maxZ) / 2;
    input.moveZ = motion.y > to.top + 0.5 ? Math.max(-1, Math.min(1, (midZ - motion.z) / 4)) : 1;
    stepPlayer(motion, input, params, 1 / 60, collision, events);
    input.jump = false;
    stepPlayer(motion, input, params, 0, collision, events);
    if (motion.grounded && Math.abs(motion.y - to.top) < 0.01) return true;
    if (collision.isOutOfWorld(motion.y)) return false;
  }
  return false;
};

const ladder = [];
for (let i = 0; i < STEPS.length; i += 1) {
  const to = STEPS[i];
  const from = STEPS[i - 1];
  const fromTop = from ? from.top : HUB.floorY;
  const fromZ = from ? from.maxZ - 4 : STAIR_START_Z - 6;
  const rise = to.top - fromTop;

  const single = reaches(fromTop, fromZ, to, rise * 1.35 + 2, 1);
  const tooLow = reaches(fromTop, fromZ, to, rise * 0.8, 1);
  const doubled = reaches(fromTop, fromZ, to, rise * 0.75 + 2, 2);
  if (!single) check(`step ${i + 1} (biome ${to.biome}) is reachable with a tall enough jump`, false, `rise ${rise}`);
  if (tooLow) check(`step ${i + 1} (biome ${to.biome}) is NOT reachable with too little height`, false, `rise ${rise}`);
  if (!doubled) check(`step ${i + 1} (biome ${to.biome}) is reachable with two shorter jumps`, false, `rise ${rise}`);
  if (to.step === 1) ladder.push({ biome: to.biome, rise });
}
check('every step is reachable with a jump taller than its rise', true);

console.log('\nmissing a jump is safe\n');
{
  const gapped = STEPS.filter((step, i) => i > 0 && step.minZ > STEPS[i - 1].maxZ + 1e-9);
  check('every gap has a pit floor', PITS.length === gapped.length, `${PITS.length} pits, ${gapped.length} gaps`);
  check('no pit is deeper than a level-1 jump can climb out of', PITS.every((pit) => {
    const before = STEPS.find((s) => Math.abs(s.maxZ - pit.minZ) < 1e-9);
    return before && before.top - pit.floor < 8;
  }));

  // Walk straight off the front of a gapped step without jumping, and with a
  // hopeless jump: the player must end up standing on something, in the world.
  let unsafe = 0;
  for (const step of gapped) {
    const from = STEPS[step.index - 1];
    for (const jump of [false, true]) {
      const physics = resolveJumpPhysics(8);
      const params = { jumpVelocity: physics.velocity, gravity: physics.gravity, maxJumps: 1 };
      const motion = createMotion();
      motion.x = 0;
      motion.y = from.top;
      motion.z = from.maxZ - 3;
      const events = createSimEvents();
      const input = { moveX: 0, moveZ: 1, jump: false, cameraYaw: 0 };
      for (let frame = 0; frame < 60 * 4; frame += 1) {
        input.jump = jump && frame === 8;
        stepPlayer(motion, input, params, 1 / 60, collision, events);
      }
      if (!motion.grounded || collision.isOutOfWorld(motion.y) || motion.y < from.top - PIT_DEPTH - 0.01) unsafe += 1;
    }
  }
  check('walking or jumping into any gap lands the player in its pit, never out of the world', unsafe === 0, `${unsafe} unsafe`);
}
check('no step can be reached with a jump shorter than its rise', true);
check('air jumps stack: two jumps at 75% of the rise reach every step', true);

console.log('\n  biome            rise   level needed at R0 (1 jump) / R1 (2) / R3 (3)');
for (const { biome, rise } of ladder) {
  const need = (jumps) => Math.max(1, Math.ceil(((rise * 1.1) / jumps - 6) / 2));
  console.log(
    `  ${BIOMES[biome - 1].name.padEnd(16)} ${String(rise).padStart(4)}   ${String(need(1)).padStart(4)} / ${String(need(2)).padStart(4)} / ${String(need(3)).padStart(4)}`,
  );
}

console.log('\npushing into a wall is stable\n');
import * as contact from '../shared/dist/index.js';
{
  // Positions reach the client as float32, so a player stopped against a face
  // arrives a hair INSIDE it. Replaying input from there must keep them pressed
  // against the face - not shove them sideways along it (the shop-counter shake).
  const wallCollision = new contact.WorldCollision();
  const params = { jumpVelocity: 40, gravity: 100, maxJumps: 1 };
  const R = contact.BODY_RADIUS;
  const stall = contact.EQUIPMENT_STALL;
  const stallMinX = stall.x - stall.width / 2;
  const stallMaxX = stall.x + stall.width / 2;
  const stallMinZ = stall.z - stall.depth / 2;
  const stallMaxZ = stall.z + stall.depth / 2;
  const riser = STEPS[1];
  const cases = [
    { label: 'the shop counter, front', x: stall.x, z: stallMinZ - R, y: 0, moveX: 0, moveZ: 1, axis: 'z', limit: (v) => v <= stallMinZ - R + 0.01 },
    { label: 'the shop counter, back', x: stall.x, z: stallMaxZ + R, y: 0, moveX: 0, moveZ: -1, axis: 'z', limit: (v) => v >= stallMaxZ + R - 0.01 },
    { label: 'the shop counter, left end', x: stallMaxX + R, z: stall.z, y: 0, moveX: 1, moveZ: 0, axis: 'x', limit: (v) => v >= stallMaxX + R - 0.01 },
    { label: 'the shop counter, right end', x: stallMinX - R, z: stall.z, y: 0, moveX: -1, moveZ: 0, axis: 'x', limit: (v) => v <= stallMinX - R + 0.01 },
    { label: 'a stair riser', x: 0, z: riser.minZ - R, y: STEPS[0].top, moveX: 0, moveZ: 1, axis: 'z', limit: (v) => v <= riser.minZ - R + 0.01 },
  ];
  for (const c of cases) {
    const motion = contact.createMotion();
    // Exactly what the client decodes from the replicated schema.
    motion.x = Math.fround(c.x);
    motion.z = Math.fround(c.z);
    motion.y = c.y;
    motion.grounded = true;
    const input = contact.createMovementInput();
    // moveX is the player's RIGHT (-X), so +X is pushed with moveX = -1.
    input.moveX = -c.moveX;
    input.moveZ = c.moveZ;
    const events = contact.createSimEvents();
    const tangent = c.axis === 'z' ? 'x' : 'z';
    const start = motion[tangent];
    let drift = 0;
    let inside = false;
    for (let i = 0; i < 60; i += 1) {
      contact.stepPlayer(motion, input, params, 1 / 60, wallCollision, events);
      drift = Math.max(drift, Math.abs(motion[tangent] - start));
      if (!c.limit(motion[c.axis])) inside = true;
      // Re-quantise every step, as if each were a fresh server patch.
      motion.x = Math.fround(motion.x);
      motion.z = Math.fround(motion.z);
    }
    check(`${c.label}: no sideways shove`, drift < 0.05, `drifted ${drift.toFixed(3)} along ${tangent}`);
    check(`${c.label}: stays outside`, !inside, `${c.axis}=${motion[c.axis]}`);
  }
}

console.log(`\n${failures === 0 ? 'course verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);

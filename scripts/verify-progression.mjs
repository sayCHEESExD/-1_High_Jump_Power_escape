/**
 * The progression tables and curves, checked without a server.
 *
 * What these get wrong is never a crash - it is a price off by a zero, a jump
 * count that skips a rebirth, a height curve that no longer says level 15 is
 * 36. This suite pins every figure the design specifies.
 *
 * Run with `npm run verify:progression`.
 */
import {
  AURA_TIERS,
  BOOT_TIERS,
  ITEM_POOL,
  MAX_WINS,
  SHOP,
  TRAIL_TIERS,
  bestOwnedBoot,
  bootMask,
  canRebirth,
  encodeEquipment,
  energyForNextLevel,
  energyPerStepFor,
  equipBest,
  equipmentHeightBonus,
  formatNumber,
  levelHeight,
  maxJumpsForRebirth,
  parseEquipment,
  rebirthCostMultiplier,
  rebirthRequiredLevel,
  resolveHeight,
  resolveJumpPhysics,
  resolveWinReward,
  shopSecondsLeft,
  shopSlotAt,
  spendEnergy,
  stockForSlot,
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

console.log('\nheight and levels\n');

check('level 15 = height 36', levelHeight(15) === 36, `got ${levelHeight(15)}`);
check('level 16 = height 38', levelHeight(16) === 38);
check('level 17 = height 40', levelHeight(17) === 40);
check('each level adds 2 height', levelHeight(100) - levelHeight(99) === 2);
check('equipment adds a percentage of height', Math.abs(resolveHeight(15, 10) - 39.6) < 1e-9);
check(
  'level cost rises every level',
  increasing(Array.from({ length: 200 }, (_, i) => energyForNextLevel(i + 1, 0))),
);
{
  const cost = energyForNextLevel(1, 0) + energyForNextLevel(2, 0);
  const result = spendEnergy(1, cost + 1, 0);
  check('banked energy is spent on as many levels as it covers', result.level === 3 && result.energy === 1, JSON.stringify(result));
  check('short of a level, nothing is spent', spendEnergy(5, 1, 0).level === 5 && spendEnergy(5, 1, 0).energy === 1);
}

console.log('\njump physics\n');

for (const height of [8, 36, 300, 2000]) {
  const physics = resolveJumpPhysics(height);
  const apex = (physics.velocity * physics.velocity) / (2 * physics.gravity);
  check(`a height-${height} jump peaks at exactly ${height}`, Math.abs(apex - height) < 1e-6, `apex ${apex}`);
  const rise = physics.velocity / physics.gravity;
  check(`and rises in under a second (${rise.toFixed(2)}s)`, rise > 0.3 && rise <= 0.85);
}

console.log('\nrebirth\n');

check('energy cost multiplier x1, x1.5, x2, x2.5', [1, 1.5, 2, 2.5].every((m, r) => rebirthCostMultiplier(r) === m));
check('and +0.5 per rebirth after that', rebirthCostMultiplier(10) === 6);
check(
  'jumps: R0 1, R1 2, R2 2, R3 3, R4 3, R5 4',
  [1, 2, 2, 3, 3, 4].every((j, r) => maxJumpsForRebirth(r) === j),
  [0, 1, 2, 3, 4, 5].map(maxJumpsForRebirth).join(','),
);
check('the rebirth level requirement never falls', Array.from({ length: 30 }, (_, r) => rebirthRequiredLevel(r)).every((v, i, a) => i === 0 || v >= a[i - 1]));
check('rebirth 2 -> 3 needs level 25, as in the reference', rebirthRequiredLevel(2) === 25);
check('later rebirths ask for more', rebirthRequiredLevel(10) > rebirthRequiredLevel(2));
check('refused below the requirement, allowed at it', !canRebirth(24, 0) && canRebirth(25, 0));

console.log('\nboots\n');

check('ten boots', BOOT_TIERS.length === 10);
check('boot 1: 3 wins, +3/step', BOOT_TIERS[0].cost === 3 && BOOT_TIERS[0].energyPerStep === 3);
check('boot 2: 10 wins, +6/step', BOOT_TIERS[1].cost === 10 && BOOT_TIERS[1].energyPerStep === 6);
check('prices and bonuses both climb', increasing(BOOT_TIERS.map((t) => t.cost)) && increasing(BOOT_TIERS.map((t) => t.energyPerStep)));
check('barefoot earns 1/step', energyPerStepFor(0) === 1);
check('the best owned boot is worn', bestOwnedBoot(bootMask(2) | bootMask(7))?.slot === 7);

console.log('\ntrails (energy multiplier)\n');

const TRAIL_SPEC = [
  ['Green', 30], ['Blue', 350], ['Purple', 1_500], ['White', 8_500], ['Black', 45_000], ['Gold', 350_000],
  ['Rainbow', 1_500_000], ['Hacker', 25_000_000], ['Heaven', 500_000_000], ['Universe', 4_500_000_000],
  ['Music', 800_000_000_000],
];
check('eleven trails', TRAIL_TIERS.length === TRAIL_SPEC.length);
check(
  'names and prices match the spec',
  TRAIL_SPEC.every(([name, cost], i) => TRAIL_TIERS[i]?.name.startsWith(name) && TRAIL_TIERS[i]?.cost === cost),
);
check('multipliers climb', increasing(TRAIL_TIERS.map((t) => t.multiplier)));

console.log('\nauras (win multiplier)\n');

const AURA_SPEC = [
  ['Nature', 150], ['Burning', 1_500], ['Crystal', 12_000], ['Lightning', 105_000], ['Ghost', 850_000],
  ['Time', 12_000_000], ['Toxic', 150_000_000], ['Sakura', 1_000_000_000], ['Black Flash', 9_500_000_000],
  ['Void', 520_000_000_000], ['Magic', 1_000_000_000_000],
];
check('eleven auras', AURA_TIERS.length === AURA_SPEC.length);
check('names and prices match the spec', AURA_SPEC.every(([name, cost], i) => AURA_TIERS[i]?.name === name && AURA_TIERS[i]?.cost === cost));
check('multipliers climb', increasing(AURA_TIERS.map((t) => t.multiplier)));
check('an unowned aura pays no bonus', resolveWinReward(40, 1, 0) === 40);
check('an owned aura multiplies the reward', resolveWinReward(40, 1, 1) === 50);
check('the biggest price is still an exact integer', Number.isSafeInteger(AURA_TIERS.at(-1).cost) && MAX_WINS >= AURA_TIERS.at(-1).cost);

console.log('\nequipment\n');

check('the pool has rarity, name, price and height bonus', ITEM_POOL.every((i) => i.rarity && i.name && i.price > 0 && i.heightBonus > 0));
check(
  'the reference items exist',
  ['Magic Ice:7:800', 'Fossil:6:800', 'Crystal:4:50', 'Forest Gem:3:50'].every((spec) => {
    const [name, bonus, price] = spec.split(':');
    return ITEM_POOL.some((i) => i.name === name && i.heightBonus === Number(bonus) && i.price === Number(price));
  }),
);
check('the shop restocks every 5 minutes', SHOP.restockSeconds === 300);
check('three items owned at most', SHOP.maxOwned === 3);
{
  const a = stockForSlot(12345).map((i) => i.id);
  const b = stockForSlot(12345).map((i) => i.id);
  check('a restock is deterministic', a.join() === b.join());
  check('a restock has three distinct items', a.length === 3 && new Set(a).size === 3, a.join());
  const distinct = new Set();
  for (let slot = 0; slot < 200; slot += 1) distinct.add(stockForSlot(slot).map((i) => i.id).join());
  check('restocks vary', distinct.size > 20, `${distinct.size} different shelves in 200`);
  check('the slot and countdown agree', shopSlotAt(300_000) === 1 && shopSecondsLeft(299_000) === 1);
}
{
  const items = parseEquipment('crystal,fossil*,feather,magic_ice*');
  check('parsing caps the backpack at three', items.length === 3);
  check('encoding round-trips', encodeEquipment(parseEquipment('crystal,fossil*')) === 'crystal,fossil*');
  check('unknown items are dropped', parseEquipment('nope*,crystal').length === 1);
  check('only equipped items add height', equipmentHeightBonus('crystal,fossil*') === 6);
  check('best equip wears all three best', encodeEquipment(equipBest(parseEquipment('crystal,fossil,feather'))) === 'crystal*,fossil*,feather*');
}

console.log('\nformatting\n');

check('formatNumber', formatNumber(940) === '940' && formatNumber(1500) === '1.5K' && formatNumber(800e9) === '800B' && formatNumber(1e12) === '1T',
  [940, 1500, 800e9, 1e12].map(formatNumber).join(' '));

console.log(`\n${failures === 0 ? 'progression verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);

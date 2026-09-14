/**
 * The server's decisions, exercised without a server.
 *
 * Every rule here is about somebody's Wins, energy or inventory, and the
 * failure mode of getting one wrong is a player paid twice, charged twice, or
 * granted something from across the map. The REJECTION paths are tested as
 * carefully as the happy ones.
 *
 * Run with `npm run verify:services`.
 */
import {
  AURA_TIERS,
  BIOMES,
  BOOT_TIERS,
  EQUIPMENT_STALL,
  TRAIL_TIERS,
  TRAINING,
  WIN_PADS,
  bootPadCentre,
  levelHeight,
  stockForSlot,
} from '../shared/dist/index.js';
import { BootService } from '../server/dist/progression/BootService.js';
import { AURA_BINDING, CosmeticService, TRAIL_BINDING } from '../server/dist/progression/CosmeticService.js';
import { EnergyService } from '../server/dist/progression/EnergyService.js';
import { EquipmentService } from '../server/dist/progression/EquipmentService.js';
import { RebirthService } from '../server/dist/progression/RebirthService.js';
import { wallet } from '../server/dist/progression/Wallet.js';
import { WinService } from '../server/dist/progression/WinService.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};

/** A stand-in for the replicated schema: the services only read and write fields. */
const makePlayer = (over = {}) => ({
  sessionId: `p${Math.random()}`,
  x: 0, y: 0, z: -8, grounded: true, treadmill: 0, jumpCount: 0,
  level: 1, energy: 0, lifetimeEnergy: 0, rebirths: 0, wins: 0,
  height: 8, jumpVelocity: 40, gravity: 100, maxJumps: 1, energyPerStep: 1,
  ownedBoots: 0, ownedTrails: 0, trailSlot: 0, ownedAuras: 0, auraSlot: 0,
  equipment: '', shopBoughtSlot: 0, shopBoughtMask: 0,
  ...over,
});

const energy = new EnergyService();

console.log('\nwin pads\n');
{
  const wins = new WinService();
  const pad = WIN_PADS[3];
  const onPad = { x: (pad.minX + pad.maxX) / 2, y: pad.maxY, z: (pad.minZ + pad.maxZ) / 2 };
  const player = makePlayer();

  check('a claim from spawn is refused', wins.claim(player, 4, 0).reason === 'not-on-pad');
  Object.assign(player, onPad);
  check('a claim for a different biome is refused', wins.claim(player, 5, 0).reason === 'not-on-pad');
  check('an unknown biome is refused', wins.claim(player, 99, 0).reason === 'unknown-biome');
  check('and nothing was paid', player.wins === 0);

  const paid = wins.claim(player, 4, 10_000);
  check('standing on the pad pays', paid.granted === true);
  check(`biome 4 pays exactly ${BIOMES[3].wins}`, player.wins === BIOMES[3].wins, `wins=${player.wins}`);
  check('an immediate second claim is refused', wins.claim(player, 4, 10_200).reason === 'cooldown');
  check('and pays nothing', player.wins === BIOMES[3].wins);

  const rich = makePlayer({ ...onPad, ownedAuras: 1 << 2, auraSlot: 3 });
  new WinService().claim(rich, 4, 0);
  check('a worn aura multiplies the reward', rich.wins === Math.floor(BIOMES[3].wins * AURA_TIERS[2].multiplier), `wins=${rich.wins}`);
  const pretender = makePlayer({ ...onPad, ownedAuras: 0, auraSlot: 11 });
  new WinService().claim(pretender, 4, 0);
  check('an aura slot that is not owned multiplies nothing', pretender.wins === BIOMES[3].wins);
}

console.log('\nwins shop boots\n');
{
  const boots = new BootService();
  const player = makePlayer({ wins: 100 });
  energy.initialise(player);
  check('a boot cannot be bought from spawn', boots.claim(player, 1, energy) === 'not-on-pad');
  check('and nothing is deducted', player.wins === 100);

  const pad2 = bootPadCentre(2);
  Object.assign(player, { x: pad2.x, y: 0.35, z: pad2.z });
  check('standing on pad 2 does not buy boot 1', boots.claim(player, 1, energy) === 'not-on-pad');
  player.wins = 5;
  check('a boot cannot be bought without the Wins', boots.claim(player, 2, energy) === 'too-poor');
  check('and nothing is deducted', player.wins === 5);
  player.wins = 15;
  check('on the pad with the Wins, it sells', boots.claim(player, 2, energy) === null);
  check('the price is deducted exactly once', player.wins === 15 - BOOT_TIERS[1].cost);
  check('energy per step becomes the boot\'s', player.energyPerStep === BOOT_TIERS[1].energyPerStep);
  check('the same boot cannot be bought twice', boots.claim(player, 2, energy) === 'already-owned');
}

console.log('\ntrails and auras\n');
{
  const trails = new CosmeticService(TRAIL_BINDING);
  const auras = new CosmeticService(AURA_BINDING);
  const player = makePlayer({ wins: 29 });
  energy.initialise(player);
  check('a trail cannot be bought short of its price', trails.buy(player, 1, energy) === false && player.wins === 29);
  player.wins = 1000;
  check('a trail can be bought', trails.buy(player, 1, energy) === true);
  check('its price is deducted', player.wins === 1000 - TRAIL_TIERS[0].cost);
  check('it is worn immediately', player.trailSlot === 1);
  check('it multiplies energy per step', player.energyPerStep === TRAIL_TIERS[0].multiplier);
  check('an unowned trail cannot be worn', trails.equip(player, 3, energy) === false && player.trailSlot === 1);
  check('taking it off is allowed', trails.equip(player, 0, energy) === true && player.energyPerStep === 1);
  check('an aura can be bought and is worn', auras.buy(player, 1, energy) === true && player.auraSlot === 1);
  check('buying twice is refused', auras.buy(player, 1, energy) === false);
}

console.log('\nequipment shop and backpack\n');
{
  const shop = new EquipmentService();
  const slot = 777;
  const stock = stockForSlot(slot);
  const zone = EQUIPMENT_STALL.zone;
  const player = makePlayer({ wins: 10_000_000_000 });
  energy.initialise(player);

  check('items cannot be bought away from the stall', shop.buy(player, 0, slot, energy) === 'not-at-shop');
  Object.assign(player, { x: (zone.minX + zone.maxX) / 2, y: 0, z: (zone.minZ + zone.maxZ) / 2 });
  check('an index off the shelf is refused', shop.buy(player, 5, slot, energy) === 'bad-index');

  const before = player.wins;
  const heightBefore = player.height;
  check('at the stall, an item sells', shop.buy(player, 0, slot, energy) === null);
  check('its price is deducted', player.wins === before - stock[0].price);
  check('it lands in the backpack, equipped', player.equipment === `${stock[0].id}*`);
  check('and raises jump height', player.height > heightBefore, `${heightBefore} -> ${player.height}`);
  check('the same shelf item is sold out for this restock', shop.buy(player, 0, slot, energy) === 'sold-out');
  check('the other two still sell', shop.buy(player, 1, slot, energy) === null && shop.buy(player, 2, slot, energy) === null);
  check('the next restock is a fresh shelf', shop.buy(player, 0, slot + 1, energy) === 'backpack-full');
  check('a full backpack refuses and charges nothing', player.equipment.split(',').length === 3);

  check('an item can be unequipped', shop.toggle(player, 0, energy) === null && !player.equipment.startsWith(`${stock[0].id}*`));
  check('best equip wears all three again', (shop.equipBest(player, energy), player.equipment.split('*').length - 1 === 3));
  check('an item can be deleted', shop.remove(player, 1, energy) === null && player.equipment.split(',').length === 2);
  check('deleting a missing index is refused', shop.remove(player, 7, energy) === 'bad-index');
}

console.log('\nenergy and levels\n');
{
  const player = makePlayer();
  energy.initialise(player);
  energy.credit(player.sessionId, player, 1 / 60);
  check('the first credit only takes a baseline', player.energy === 0);

  player.z += 0.5;
  energy.credit(player.sessionId, player, 1 / 60);
  check('running pays energy', player.energy > 0, `energy=${player.energy}`);

  const teleported = player.lifetimeEnergy;
  player.z += 400;
  energy.credit(player.sessionId, player, 1 / 60);
  check('a teleport pays nothing', player.lifetimeEnergy === teleported);

  const beforeJump = player.lifetimeEnergy;
  player.jumpCount += 1;
  energy.credit(player.sessionId, player, 1 / 60);
  check('a jump pays a bonus', player.lifetimeEnergy > beforeJump);

  energy.grant(player, 1_000_000);
  check('banked energy is spent on levels automatically', player.level > 20, `level ${player.level}`);
  check('height follows the level', Math.abs(player.height - levelHeight(player.level)) < 1e-4);

  const belt = (index, rebirths) => {
    const runner = makePlayer({ x: TRAINING.xs[index - 1], y: TRAINING.deckTop, z: TRAINING.centerZ, treadmill: index, rebirths });
    energy.initialise(runner);
    energy.credit(runner.sessionId, runner, 1 / 60);
    energy.credit(runner.sessionId, runner, 1 / 60);
    return runner.lifetimeEnergy;
  };
  check('the Beginner belt pays', belt(1, 0) > 0);
  check('a locked belt pays nothing', belt(4, 0) === 0);
  check('the 4 Rebirth belt pays x3 the Beginner', Math.abs(belt(4, 4) - belt(1, 4) * 3) < 1e-9, `${belt(4, 4)} vs ${belt(1, 4)}`);
}

console.log('\nrebirth\n');
{
  const rebirths = new RebirthService();
  const player = makePlayer({ wins: 500, ownedBoots: 3, level: 24 });
  energy.initialise(player);
  check('refused below the required level', rebirths.rebirth(player, energy) === false && player.rebirths === 0);
  player.level = 25;
  player.energy = 40;
  check('allowed at it', rebirths.rebirth(player, energy) === true);
  check('level and energy reset', player.level === 1 && player.energy === 0);
  check('a second jump is granted', player.maxJumps === 2);
  check('wins and boots are kept', player.wins === 500 && player.ownedBoots === 3);
}

console.log('\nthe wallet\n');
{
  const player = makePlayer({ wins: 10 });
  check('spend what you have', wallet.spend(player, 10) === true && player.wins === 0);
  check('cannot spend what you do not have', wallet.spend(player, 1) === false && player.wins === 0);
  wallet.add(player, Number.NaN);
  wallet.add(player, -5);
  check('bad credits are ignored', player.wins === 0);
  player.wins = Number.MAX_SAFE_INTEGER - 5;
  wallet.add(player, 1e12);
  check('a huge award saturates', player.wins === Number.MAX_SAFE_INTEGER);
}

console.log(`\n${failures === 0 ? 'services verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);

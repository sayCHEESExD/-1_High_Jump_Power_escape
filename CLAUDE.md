# CLAUDE.md — +1 High Jump Power Escape

Permanent project rules. Read before changing anything.

## What this is

A production browser multiplayer staircase obby, the next game in the series
after `+1 Backflip Obby Escape`, `+1 Speed Animal Escape`, `+1 Speed Broom Escape`
and `+1 Speed Moonwalk Escape`. It reuses their architecture: npm workspaces
(`shared`, `server`, `client`), Three.js + Vite client, Colyseus server,
server-authoritative movement with client prediction and reconciliation.

The one gameplay difference: progression buys **jump height** and **jump count**,
and the world is a **staircase** climbing along +Z through 14 biomes.

## Hard constraints

- Client build under **12 MB** (`npm run size:client`).
- Progression, rewards, purchases and inventories are **server-authoritative**. The
  client only sends input and requests.
- Desktop and mobile are both first-class.
- Ports **2570** (server) and **5176** (Vite): the earlier games use 2567-2569 and
  5173-5175 on the same machine.
- Rooms hold `MAX_PLAYERS_PER_ROOM` (15); `onAuth` re-checks it; `autoDispose` is
  explicit so an empty room closes.

## Movement and jumping

- `stepPlayer` in `shared/src/sim/PlayerSim.ts` is THE simulation, run by the server
  and by client prediction. Never add a second physics implementation.
- **Height is the progression figure; physics is solved backwards from it.**
  `resolveJumpPhysics(height)` returns a velocity and a gravity so a jump peaks at
  exactly `height`, with apex time growing only logarithmically. Late-game jumps are
  hundreds of units tall but never floaty. The server resolves them in
  `EnergyService.syncDerived` and replicates `jumpVelocity`, `gravity` and `maxJumps`.
- **Multi-jump:** the first press leaves the ground; each further press while airborne
  is an AIR jump (a backflip on screen) at full velocity, up to `maxJumps`. Walking off
  a ledge spends the ground jump. `flipCount` is replicated so remotes play the flip.
- Horizontal speed is NOT a progression axis. Run speed stays constant; a staircase
  where speed also ran away would make every landing an overshoot.
- `LANDING_TOLERANCE` equals `MOVEMENT.stepHeight`. Pads and decks sit under it.
- Substepping (`maxSubstepDistance`, `maxSubsteps` 96) keeps tall, fast jumps colliding
  reliably. Never "fix" tunnelling by capping jump height.

## World

- `shared/src/config/course.ts` generates `STEPS`, `WIN_PADS` and `COURSE_SOLIDS` from
  the `BIOMES` table. The renderer and the collision read the same arrays.
- Player's LEFT is **+X**, RIGHT is **-X** (camera right is -X at yaw 0). Wins Shop
  boots left, scoreboard right, High Training at the back (-Z), equipment stall just
  before the staircase, win pads on the left of each biome's 3rd step.
- The hub's front wall is a **solid**, so the side clamp can switch from hub width to
  staircase width at the mouth without shoving anyone sideways.
- A fall is `y < fallFloorAt(z) - FALL_MARGIN`, measured against the step last passed
  over. Hopping back down a step is safe; dropping into a gap is lethal.
- **There are no checkpoints.** `GameRoom.placeAt` takes no position: join, fall, win and
  rebirth all land at `SPAWN_POSITION`.
- World textures are drawn on canvases (`WorldTextures`). The only image files are the
  supplied player texture and the HUD icons in `assets/ui/`.

## Progression

- **Energy** is granted only by `EnergyService`: the distance between authoritative
  positions (capped, so a teleport pays nothing), a bonus per jump the simulation
  counted, or an unlocked treadmill belt. `spendEnergy` spends it on levels; nothing
  else raises a level.
- Height = `6 + 2 x level` (level 15 = 36), times `1 + equipped item bonus %`.
- Rebirth resets level and energy, grants jumps (1, 2, 2, 3, 3, 4, ...) and raises the
  energy COST multiplier (x1, x1.5, x2, ... +0.5 each). Wins, boots, trails, auras and
  equipment are kept.
- **Wins move only through `Wallet`.** They are added by `WinService` (validated against
  the server's position, then the player is sent to spawn) and spent by boots,
  trails, auras and equipment. Wins are `float64` (prices reach 1T); `MAX_WINS` is the
  largest exact integer.
- Trails multiply energy per step; auras multiply win rewards. Neither touches the
  other's axis. Both share one `CosmeticService`.
- Equipment stock is a pure function of the restock slot (`stockForSlot`), computed
  from the server clock. Max 3 owned, 3 equipped. The backpack is one replicated string
  (`"fossil*,crystal"`), because a nested schema array would not trigger the player's
  onChange.
- Only deriving facts are persisted. Height, jump physics and rates are recomputed on
  load.

## Architecture rules

- No god files. `shared/` never imports three, colyseus or the DOM. The client touches
  colyseus.js only in `client/src/net/`.
- Animators write only bones and their own pivot nodes (`tipPivot`, `flipPivot`,
  `visual`), never the physics root.
- Remote animation is derived from monotonic counters against a first-sight baseline.
- Only the local player makes sound. Music is streamed and paused when muted.
- Portal (Unblocked City) integration is build-time env only (`portalConfig.ts`) and
  must never block play.

## Verification

Do not claim something works without running it: `npm run typecheck`,
`npm run verify`, `npm run build:client`, `npm run build:server`,
`npm run size:client`, and a real browser for behaviour.

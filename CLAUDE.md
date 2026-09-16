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
- Replicated positions are **float32**, so the client replays from a player a hair inside
  a face it was stopped against. `resolveAxis` treats overlap within `CONTACT_EPSILON` as
  touching; without it the other axis shoves the player to the far end of the box every
  patch (the shop-counter shake). `verify-course` asserts this for walls and risers.

## World

- `shared/src/config/course.ts` generates `STEPS`, `WIN_PADS` and `COURSE_SOLIDS` from
  the `BIOMES` table. The renderer and the collision read the same arrays.
- Player's LEFT is **+X**, RIGHT is **-X** (camera right is -X at yaw 0). Wins Shop
  boots left, scoreboard right, High Training at the back (-Z), equipment stall just
  before the staircase, win pads on the left of each biome's 3rd step.
- The hub's front wall is a **solid**, so the side clamp can switch from hub width to
  staircase width at the mouth without shoving anyone sideways.
- **Missing a jump has NO consequence beyond the drop.** Every gap has a floor (`PITS`,
  `PIT_DEPTH` below the step before it), the sides are clamped, and nothing sends a player
  to spawn for falling. There is no death mechanic, animation, sound or counter.
- The only non-voluntary placement is `isOutOfWorld` (`y <= OUT_OF_WORLD_Y`), a safety
  net for glitches that normal play cannot reach. Do not reintroduce a fall rule.
- **There are no checkpoints.** `GameRoom.placeAt` takes no position: join, fall, win and
  rebirth all land at `SPAWN_POSITION`.
- **There is no sprint.** `MOVEMENT.moveSpeed` is the only ground speed; Shift is unbound
  and neither the input state nor `MoveMessage` carries a sprint flag.
- The jump animations (crouch, airborne, backflip, landing) play at
  `JUMP_ANIMATION.playbackRate` (0.5). That scales only the animator's clock, never physics.
- The landing impact (rubble + dust ring in `LandingDebris`, `impact` sound, camera
  `shake`) is LOCAL presentation for the local player only. `LocalPlayer.landingImpact`
  reads the touchdown fall speed relative to the player's own jump velocity; it never
  writes motion, so jump physics is unchanged.
- Spring boots (`SpringBoots`) hang off the lower leg bones; while worn, `PlayerCharacter`
  lifts the body by `SPRING_LIFT` so the springs reach the ground.
- **No two faces may be LEVEL.** Boxes that meet must overlap (walls sink into their
  floor by `SEAM_OVERLAP`; ground patches are buried and stand `PATCH_RELIEF` proud;
  stacked slabs get different heights). Two surfaces in one plane have no depth order,
  so they flicker - and a gap under ~0.02 fails the same way past ~180 units.
- World textures are drawn on canvases (`WorldTextures`). The only image files are the
  supplied player texture, the HUD icons in `assets/ui/`, and one picture per biome in
  `assets/ui/` named exactly after the biome (`Snow Peak.png`), drawn on its `BiomeSign`.
- The landing impact sound is `assets/audio/fall.mp3`.
- Biome boards hang at one fixed spot per biome (`biomeSignLayout.ts`). Scenery must call
  `blocksBiomeSign` and stay out of that sightline; never place decor in front of a board.
- A win plays `TrophyBurst`: local 3D trophy sprites popping around the player, following
  them through the return to spawn. There is no screen-space trophy flight.

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

## Bloxity

- The SDK (`window.Legion.SDK`) loads from `https://sdk.bloxity.io/legion-sdk.min.js` in
  `client/index.html`. **Only `client/src/bloxity/Bloxity.ts` touches it**, and every call
  is guarded: a blocked CDN must never stop play. Slug: `high-jump-power-escape`
  (`VITE_BLOXITY_GAME_ID` overrides).
- There is exactly ONE `auth.onUserChanged` subscription (in `Bloxity`); UI fans out from
  it. The user object is never cached.
- Bux purchases pass a SKU only. Wins are granted by the SERVER when Bloxity's webhook
  hits `POST /bloxity/bux` (secret header `x-legion-webhook-secret`, env
  `BLOXITY_WEBHOOK_SECRET`; without it every delivery is refused). The SKU -> Wins table
  is `server/src/bloxity/BuxGrants.ts`; grants are queued to disk, then applied through
  `wallet.add` to the session whose token the server verified with Bloxity.
- Avatar cosmetics dress the LOCAL character only (`BloxityAvatar`): a skin or body part
  swaps in Bloxity's `player.glb` via `PlayerCharacter.setModel`; hats/back hang on bones;
  proportions scale bones, never rotate them.

## Verification

Do not claim something works without running it: `npm run typecheck`,
`npm run verify`, `npm run build:client`, `npm run build:server`,
`npm run size:client`, and a real browser for behaviour.

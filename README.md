# +1 High Jump Power Escape

A browser multiplayer staircase obby in the +1 Escape series. Run and jump to farm
energy, spend it on levels that raise your jump height, and climb 14 biomes of a
giant staircase into the sky. Bank Wins at each biome's pad, then spend them on
spring boots, trails, auras and equipment. Rebirth for extra jumps (air jumps are
backflips).

Three.js + TypeScript + Vite on the client, Colyseus + Node on the server, and a
framework-free `shared/` package both sides simulate with. Gameplay is
server-authoritative, rooms hold 15 players, and an empty room closes itself.

## Run it

```bash
npm install
```

```bash
npm run dev
```

The client is on http://localhost:5176 and the server on ws://localhost:2570
(the previous games in the series use 5173-5175 and 2567-2569).

## Checks

```bash
npm run typecheck
```

```bash
npm run verify
```

`verify` runs four suites: `verify:assets` (every runtime asset exists),
`verify:course` (biome table, layout sides, win pads, and a real simulation that
every step is reachable with enough height and NOT with too little),
`verify:progression` (height curve, rebirth jumps, every price in the spec), and
`verify:services` (the server's win, boot, cosmetic, equipment, energy and rebirth
decisions, including rejection paths).

```bash
npm run build:client
```

```bash
npm run build:server
```

```bash
npm run size:client
```

`size:client` enforces the 12 MB budget. With the server running,
`npm run verify:capacity` checks the 15-player cap, overflow routing and that empty
rooms close.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD / arrows (mouse aims the camera) | left stick |
| Sprint | Shift | push the stick to its edge |
| Jump / air backflip | Space | jump button |
| Rebirth / Trail / Aura / Backpack / Mute | R / T / Y / B / M | left rail tiles |
| Free the cursor | Esc | - |

## Tuning

Every gameplay number lives in `shared/src/config/`:

| File | What it holds |
| --- | --- |
| `course.ts` | `BIOMES` (steps, rise, depth, width, gap, wins per biome) and the hub layout |
| `progression.ts` | energy per step, level cost curve, height per level |
| `rebirth.ts` | energy cost multiplier, jumps per rebirth, rebirth level requirement |
| `movement.ts` | run speed, air control, how jump height becomes velocity and gravity |
| `boots.ts` | the 10 Win Shop boots |
| `trails.ts` / `auras.ts` | the cosmetic ladders and their multipliers |
| `treadmills.ts` | High Training tiers and belt layout |
| `equipment.ts` | the item pool, rarities, restock period, backpack limits |

## Deploy

The same split as the previous games: the client is static files, the server is a
long-lived Node process.

- **Server:** `Dockerfile` at the repo root. Set `PORT` (defaults to 2570) and mount
  a volume at `HIGHJUMP_DATA_DIR` (default `/data`) or a redeploy wipes profiles.
  `/health` reports rooms and players.
- **Client:** `npm run build:client` and publish `client/dist` (`netlify.toml` is
  included). Set `VITE_SERVER_URL` at build time to the server's `wss://` address.

### Unblocked City

The portal hooks are build-time configuration only, and nothing is hardcoded. With
none of these set, the game runs standalone:

| Variable | Purpose |
| --- | --- |
| `VITE_PORTAL_NAME` | label used in logs |
| `VITE_PORTAL_SDK_URL` | optional portal script, loaded after boot; failures are ignored |
| `VITE_PORTAL_ORIGINS` | comma-separated parent origins that receive a `game-ready` postMessage |

Wiring lives in `client/src/config/portalConfig.ts` and `client/src/portal/Portal.ts`.

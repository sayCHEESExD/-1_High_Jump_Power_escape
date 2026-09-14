import type { Vec3 } from '../types/math.js';

/**
 * World-space constants shared by the renderer and the authoritative server.
 *
 * Units are "world units" (1 unit ~= 1 Roblox stud in feel). The supplied
 * player.fbx is authored at 320 units tall, so it is scaled down on load.
 */

/** Multiplier applied to the loaded FBX so the character is PLAYER_HEIGHT tall. */
export const FBX_TO_WORLD_SCALE = 0.01;

/** Player height in world units (320 * FBX_TO_WORLD_SCALE). */
export const PLAYER_HEIGHT = 3.2;

/** Height of the collision body, feet to crown. */
export const BODY_HEIGHT = PLAYER_HEIGHT;

/** Horizontal half-width of the collision body. */
export const BODY_RADIUS = 0.72;

/**
 * Spawn transform: the middle of the hub, facing the staircase (+Z).
 *
 * There is exactly ONE placement in this game. Joining, dying, banking a win
 * and rebirthing all land here - there are no checkpoints.
 */
export const SPAWN_POSITION: Readonly<Vec3> = { x: 0, y: 0, z: -8 };

/** Spawn yaw in radians (facing +Z, up the staircase). */
export const SPAWN_ROTATION_Y = 0;

/** Absolute floor of the world. Anything below it has fallen out. */
export const DEATH_PLANE_Y = -30;

/**
 * How far below the step a player last stood over they may drop before the
 * fall counts as a death. Falling into a gap is lethal; hopping back down one
 * step is not, because that step is the new reference.
 */
export const FALL_MARGIN = 14;

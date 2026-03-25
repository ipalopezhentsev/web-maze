import { ECOLS, ANIM_FRAMES, DIR_DX, DIR_DY } from './constants.ts';
import { Direction } from './types.ts';
import type { MazeData } from './types.ts';

export interface PlayerState {
  /** Position in expanded grid */
  gx: number;
  gy: number;
  /** Pixel position (gx * cellSize, gy * cellSize) — for smooth rendering */
  px: number;
  py: number;
  /** Animation frames remaining (0 = at grid boundary, ready to move) */
  anim: number;
  /** Current movement direction */
  dir: Direction;
  /** Walk phase toggle (0 or 1) for sprite alternation */
  walk: number;
}

export function createPlayer(gx: number, gy: number, cellSize: number): PlayerState {
  return {
    gx,
    gy,
    px: gx * cellSize,
    py: gy * cellSize,
    anim: 0,
    dir: Direction.Down,
    walk: 0,
  };
}

/**
 * Update player position for one frame.
 * Returns true if the player moved to a new grid cell this frame.
 */
export function updatePlayer(
  player: PlayerState,
  inputDir: Direction | -1,
  maze: MazeData,
  cellSize: number,
): boolean {
  const pixelsPerFrame = cellSize / ANIM_FRAMES;

  if (player.anim > 0) {
    // Mid-animation: continue moving in current direction
    player.px += DIR_DX[player.dir] * pixelsPerFrame;
    player.py += DIR_DY[player.dir] * pixelsPerFrame;
    player.anim--;

    if (player.anim === 0) {
      // Arrived at new grid cell
      player.gx += DIR_DX[player.dir];
      player.gy += DIR_DY[player.dir];
      player.px = player.gx * cellSize;
      player.py = player.gy * cellSize;
      player.walk ^= 1;
      return true;
    }

    // Corner-cutting: if close to destination (1 frame away) and player
    // wants to turn perpendicular, snap early and start the new direction
    if (player.anim === 1 && inputDir !== -1 && inputDir !== player.dir) {
      const isPerp = (inputDir <= 1) !== (player.dir <= 1); // horizontal vs vertical
      if (isPerp) {
        // Snap to destination
        const newGx = player.gx + DIR_DX[player.dir];
        const newGy = player.gy + DIR_DY[player.dir];
        // Check if perpendicular direction is passable from the new cell
        const testGx = newGx + DIR_DX[inputDir];
        const testGy = newGy + DIR_DY[inputDir];
        if (!maze.wallmap[testGy * ECOLS + testGx]) {
          player.gx = newGx;
          player.gy = newGy;
          player.px = player.gx * cellSize;
          player.py = player.gy * cellSize;
          player.anim = 0;
          player.walk ^= 1;
          // Arrived at new cell via corner-cut — return true so
          // gems/items at this cell get collected
          return true;
        }
      }
    }

    if (player.anim > 0) return false;
  }

  // At grid boundary — try to start a new move
  if (inputDir === -1) return false;

  const nextGx = player.gx + DIR_DX[inputDir];
  const nextGy = player.gy + DIR_DY[inputDir];

  // Wall collision check
  if (maze.wallmap[nextGy * ECOLS + nextGx]) {
    return false; // blocked
  }

  // Start moving
  player.dir = inputDir;
  player.anim = ANIM_FRAMES;
  player.px += DIR_DX[player.dir] * pixelsPerFrame;
  player.py += DIR_DY[player.dir] * pixelsPerFrame;
  player.anim--;

  if (player.anim === 0) {
    player.gx = nextGx;
    player.gy = nextGy;
    player.px = player.gx * cellSize;
    player.py = player.gy * cellSize;
    player.walk ^= 1;
    return true;
  }

  return false;
}

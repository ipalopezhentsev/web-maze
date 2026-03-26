import { COLS, ROWS, ECOLS, EROWS, ANIM_FRAMES, DIR_DX, DIR_DY, STUN_SECS, FPS } from './constants.ts';
import { Direction } from './types.ts';
import type { MazeData } from './types.ts';
import type { GemsState } from './gems.ts';

export interface EnemyState {
  gx: number;
  gy: number;
  px: number;
  py: number;
  anim: number;
  dir: Direction;
  walk: number;
  /** Stun frames remaining (0 = active) */
  stunFrames: number;
}

export interface EnemiesContext {
  enemies: EnemyState[];
  /** Round-robin index: which enemy moves next */
  nextEnemy: number;
  /** Frame accumulator for enemy move timing */
  moveAccum: number;
  /** Frames between enemy moves */
  enemyFrames: number;
  /** % chance enemy uses chase AI (BFS) vs random */
  chasePct: number;
}

export function createEnemies(
  count: number,
  playerGx: number,
  playerGy: number,
  exitGx: number,
  exitGy: number,
  enemyFrames: number,
  chasePct: number,
  cellSize: number,
): EnemiesContext {
  const enemies: EnemyState[] = [];
  const usedPositions = new Set<string>();
  usedPositions.add(`${playerGx},${playerGy}`);
  usedPositions.add(`${exitGx},${exitGy}`);

  for (let i = 0; i < count; i++) {
    let gx: number, gy: number;
    do {
      const cx = (Math.random() * COLS) | 0;
      const cy = (Math.random() * ROWS) | 0;
      gx = cx * 2 + 1;
      gy = cy * 2 + 1;
    } while (usedPositions.has(`${gx},${gy}`));
    usedPositions.add(`${gx},${gy}`);

    enemies.push({
      gx, gy,
      px: gx * cellSize,
      py: gy * cellSize,
      anim: 0,
      dir: Direction.Down,
      walk: 0,
      stunFrames: 0,
    });
  }

  return {
    enemies,
    nextEnemy: 0,
    moveAccum: 0,
    enemyFrames,
    chasePct,
  };
}

/**
 * BFS pathfinding on the full expanded grid (29x19).
 * Operates at the same resolution as enemy movement — no coarse
 * maze-cell approximation that was only there for ZX memory savings.
 *
 * Runs BFS from the player position outward. When it reaches the enemy,
 * the stored direction tells the enemy which way to go.
 */
export function bfsChase(
  enemyGx: number, enemyGy: number,
  playerGx: number, playerGy: number,
  wallmap: Uint8Array,
): Direction | -1 {
  const totalCells = EROWS * ECOLS;
  const enemyIdx = enemyGy * ECOLS + enemyGx;
  const playerIdx = playerGy * ECOLS + playerGx;

  if (enemyIdx === playerIdx) return -1;

  // vis[i] = 0 (unvisited), 1-4 = direction+1 that reached this cell, 5 = start
  const vis = new Uint8Array(totalCells);
  const queue = new Uint16Array(totalCells);
  let head = 0, tail = 0;

  vis[playerIdx] = 5;
  queue[tail++] = playerIdx;

  while (head < tail) {
    const ci = queue[head++];

    if (ci === enemyIdx) {
      const d = vis[ci] - 1;
      if (d === 0) return Direction.Right;  // BFS came left → enemy goes right
      if (d === 1) return Direction.Left;   // BFS came right → enemy goes left
      if (d === 2) return Direction.Down;   // BFS came up → enemy goes down
      if (d === 3) return Direction.Up;     // BFS came down → enemy goes up
      return -1;
    }

    const gx = ci % ECOLS;
    const gy = (ci / ECOLS) | 0;

    // Left
    if (gx > 0) {
      const ni = ci - 1;
      if (!vis[ni] && !wallmap[ni]) { vis[ni] = 1; queue[tail++] = ni; }
    }
    // Right
    if (gx < ECOLS - 1) {
      const ni = ci + 1;
      if (!vis[ni] && !wallmap[ni]) { vis[ni] = 2; queue[tail++] = ni; }
    }
    // Up
    if (gy > 0) {
      const ni = ci - ECOLS;
      if (!vis[ni] && !wallmap[ni]) { vis[ni] = 3; queue[tail++] = ni; }
    }
    // Down
    if (gy < EROWS - 1) {
      const ni = ci + ECOLS;
      if (!vis[ni] && !wallmap[ni]) { vis[ni] = 4; queue[tail++] = ni; }
    }
  }

  return -1;
}

/**
 * Pick a random passable direction from expanded grid position.
 */
function randomDir(ex: number, ey: number, wallmap: Uint8Array): Direction | -1 {
  const fi = ey * ECOLS + ex;
  const dirs: Direction[] = [];

  if (!wallmap[fi - 1]) dirs.push(Direction.Left);
  if (!wallmap[fi + 1]) dirs.push(Direction.Right);
  if (!wallmap[fi - ECOLS]) dirs.push(Direction.Up);
  if (!wallmap[fi + ECOLS]) dirs.push(Direction.Down);

  if (dirs.length === 0) return -1;
  return dirs[(Math.random() * dirs.length) | 0];
}

/**
 * Decide which direction an enemy should move.
 */
function decideDirection(
  enemy: EnemyState,
  playerGx: number, playerGy: number,
  maze: MazeData,
  chasePct: number,
): Direction | -1 {
  // If between cells (not at a cell center), keep going in same direction
  if (!(enemy.gx & 1) || !(enemy.gy & 1)) {
    return enemy.dir;
  }

  // At a cell center — chase% chance to use BFS, otherwise random
  if (Math.random() * 100 < chasePct) {
    const dir = bfsChase(enemy.gx, enemy.gy, playerGx, playerGy, maze.wallmap);
    if (dir !== -1) return dir;
  }

  return randomDir(enemy.gx, enemy.gy, maze.wallmap);
}

/**
 * Update enemies for one frame. Returns true if any enemy collides
 * with the player (grid match or pixel proximity).
 */
export function updateEnemies(
  ctx: EnemiesContext,
  playerGx: number, playerGy: number,
  playerPx: number, playerPy: number,
  maze: MazeData,
  gems: GemsState,
  cellSize: number,
): boolean {
  const pixelsPerFrame = cellSize / ANIM_FRAMES;
  const collisionDist = cellSize * 0.7;
  let collision = false;

  // Advance all mid-animation enemies
  for (const enemy of ctx.enemies) {
    if (enemy.stunFrames > 0) {
      enemy.stunFrames--;
      continue;
    }

    if (enemy.anim > 0) {
      enemy.px += DIR_DX[enemy.dir] * pixelsPerFrame;
      enemy.py += DIR_DY[enemy.dir] * pixelsPerFrame;
      enemy.anim--;

      if (enemy.anim === 0) {
        enemy.gx += DIR_DX[enemy.dir];
        enemy.gy += DIR_DY[enemy.dir];
        enemy.px = enemy.gx * cellSize;
        enemy.py = enemy.gy * cellSize;

        // Enemy eats gem if it lands on one
        if ((enemy.gx & 1) && (enemy.gy & 1)) {
          const cx = enemy.gx >> 1;
          const cy = enemy.gy >> 1;
          const idx = cy * COLS + cx;
          if (gems.gemmap[idx]) {
            gems.gemmap[idx] = 0;
            gems.gemsLeft--;
          }
        }
      }
    }

    // Check collision: grid position match OR pixel proximity
    if (enemy.gx === playerGx && enemy.gy === playerGy) {
      collision = true;
    } else if (Math.abs(enemy.px - playerPx) < collisionDist &&
               Math.abs(enemy.py - playerPy) < collisionDist) {
      collision = true;
    }
  }

  // Trigger new moves based on timing
  ctx.moveAccum++;
  if (ctx.moveAccum >= ctx.enemyFrames) {
    ctx.moveAccum = 0;

    // Move next enemy in round-robin
    const enemy = ctx.enemies[ctx.nextEnemy];
    if (enemy.anim === 0 && enemy.stunFrames === 0) {
      const dir = decideDirection(enemy, playerGx, playerGy, maze, ctx.chasePct);
      if (dir !== -1) {
        enemy.dir = dir;
        enemy.walk ^= 1;
        enemy.anim = ANIM_FRAMES;
        enemy.px += DIR_DX[dir] * pixelsPerFrame;
        enemy.py += DIR_DY[dir] * pixelsPerFrame;
        enemy.anim--;
      }
    }

    ctx.nextEnemy = (ctx.nextEnemy + 1) % ctx.enemies.length;
  }

  return collision;
}

/**
 * Fire the stun gun in the player's facing direction.
 * Returns the list of grid cells the shot passes through (for visual effect),
 * and stuns the first enemy hit.
 */
export function fireGun(
  playerGx: number, playerGy: number, playerDir: Direction,
  ctx: EnemiesContext,
  wallmap: Uint8Array,
): { path: Array<{ gx: number; gy: number }>; hitEnemy: number } {
  const ddx = DIR_DX[playerDir];
  const ddy = DIR_DY[playerDir];
  const path: Array<{ gx: number; gy: number }> = [];
  let hitEnemy = -1;

  let gx = playerGx;
  let gy = playerGy;

  while (path.length < ECOLS) {
    gx += ddx;
    gy += ddy;
    if (gx < 0 || gx >= ECOLS || gy < 0 || gy >= EROWS) break;
    if (wallmap[gy * ECOLS + gx]) break;

    path.push({ gx, gy });

    // Check for enemy hit
    for (let i = 0; i < ctx.enemies.length; i++) {
      const e = ctx.enemies[i];
      if (e.stunFrames === 0 && e.gx === gx && e.gy === gy) {
        hitEnemy = i;
        break;
      }
    }
    if (hitEnemy !== -1) break;
  }

  // Apply stun
  if (hitEnemy !== -1) {
    ctx.enemies[hitEnemy].stunFrames = STUN_SECS * FPS;
  }

  return { path, hitEnemy };
}

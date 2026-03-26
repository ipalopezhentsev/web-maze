/**
 * A* pathfinding with utility-based target selection for demo AI.
 *
 * The AI evaluates every possible target (gem, gun, exit) with a utility
 * score that weighs:
 *   - distance to target
 *   - enemy danger along the path (enemies are chasing the player)
 *   - time remaining vs distance to the exit
 *   - score-maximising gem collection when exit is open but time allows
 *
 * A* uses a danger-aware cost function: cells near active enemies are
 * more expensive to traverse, naturally routing the player away from
 * threats while still heading toward the chosen goal.
 */

import { COLS, ROWS, ECOLS, EROWS, FPS, DIR_DX, DIR_DY } from './constants.ts';
import { Direction } from './types.ts';
import { bfsDistances } from './enemy.ts';
import type { EnemyState } from './enemy.ts';
import type { GemsState } from './gems.ts';
import type { PlayerState } from './player.ts';

// ─── A* with danger-weighted movement costs ───

const GRID_SIZE = EROWS * ECOLS;

/** Manhattan distance (admissible heuristic since base cost per cell >= 1). */
function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

// Neighbour deltas matching Direction enum: 0=left, 1=right, 2=up, 3=down
const NDX = [-1, 1, 0, 0];
const NDY = [0, 0, -1, 1];

/**
 * A* from start to goal on the expanded grid.
 * `dangerMap[idx]` adds extra cost when entering cell `idx`.
 * Returns the first-step Direction from start, or -1 if unreachable.
 */
function astarFirstStep(
  sx: number, sy: number,
  gx: number, gy: number,
  wallmap: Uint8Array,
  dangerMap: Float32Array,
): Direction | -1 {
  const si = sy * ECOLS + sx;
  const gi = gy * ECOLS + gx;
  if (si === gi) return -1;

  // g-costs
  const g = new Float32Array(GRID_SIZE).fill(Infinity);
  // firstDir[i] = direction taken from start on the path that reaches i
  const firstDir = new Int8Array(GRID_SIZE).fill(-1);
  const closed = new Uint8Array(GRID_SIZE);

  // Min-heap storing {f, idx}
  // For a 551-cell grid a plain array-heap is fast enough.
  const heap: number[] = [];            // interleaved: [f_as_int, idx, f_as_int, idx, ...]
  const fBits = (f: number, idx: number) => { heap.push(f, idx); siftUp(heap.length / 2 - 1); };

  function siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p * 2] <= heap[i * 2]) break;
      // swap
      const tf = heap[p * 2], ti = heap[p * 2 + 1];
      heap[p * 2] = heap[i * 2]; heap[p * 2 + 1] = heap[i * 2 + 1];
      heap[i * 2] = tf; heap[i * 2 + 1] = ti;
      i = p;
    }
  }

  function siftDown(): void {
    const n = heap.length / 2;
    let i = 0;
    while (true) {
      let s = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && heap[l * 2] < heap[s * 2]) s = l;
      if (r < n && heap[r * 2] < heap[s * 2]) s = r;
      if (s === i) break;
      const tf = heap[s * 2], ti = heap[s * 2 + 1];
      heap[s * 2] = heap[i * 2]; heap[s * 2 + 1] = heap[i * 2 + 1];
      heap[i * 2] = tf; heap[i * 2 + 1] = ti;
      i = s;
    }
  }

  function heapPop(): number {               // returns idx
    const idx = heap[1];
    const last = heap.length - 2;
    heap[0] = heap[last]; heap[1] = heap[last + 1];
    heap.length = last;
    if (heap.length > 0) siftDown();
    return idx;
  }

  g[si] = 0;
  fBits(manhattan(sx, sy, gx, gy), si);

  while (heap.length > 0) {
    const ci = heapPop();
    if (ci === gi) return firstDir[ci] as Direction;
    if (closed[ci]) continue;
    closed[ci] = 1;

    const cx = ci % ECOLS;
    const cy = (ci / ECOLS) | 0;

    for (let d = 0; d < 4; d++) {
      const nx = cx + NDX[d];
      const ny = cy + NDY[d];
      if (nx < 0 || nx >= ECOLS || ny < 0 || ny >= EROWS) continue;
      const ni = ny * ECOLS + nx;
      if (wallmap[ni] || closed[ni]) continue;

      const stepCost = 1 + dangerMap[ni];
      const ng = g[ci] + stepCost;
      if (ng < g[ni]) {
        g[ni] = ng;
        firstDir[ni] = ci === si ? d : firstDir[ci];
        fBits(ng + manhattan(nx, ny, gx, gy), ni);
      }
    }
  }

  return -1;
}

// ─── Danger map ───

/** Radius (in expanded-grid steps) within which an enemy inflates cell cost. */
const DANGER_RADIUS = 10;
/** Peak danger cost added when standing on an enemy's cell. */
const DANGER_WEIGHT = 4.0;
/**
 * Extra multiplier for cells that lie between an enemy and the player
 * (the enemy is likely heading that way).
 */
const INTERCEPT_WEIGHT = 2.0;

function buildDangerMap(
  enemies: EnemyState[],
  enemyDists: Uint16Array[],
  playerDist: Uint16Array,
): Float32Array {
  const dm = new Float32Array(GRID_SIZE);

  for (let ei = 0; ei < enemies.length; ei++) {
    if (enemies[ei].stunFrames > 0) continue;
    const ed = enemyDists[ei];
    for (let idx = 0; idx < GRID_SIZE; idx++) {
      const d = ed[idx];
      if (d >= DANGER_RADIUS || d === 0xFFFF) continue;

      // Base danger: inversely proportional to distance
      let penalty = DANGER_WEIGHT * (DANGER_RADIUS - d) / DANGER_RADIUS;

      // Intercept bonus: if this cell is closer to the player than the
      // enemy is, the enemy is likely to pass through it while chasing.
      const pd = playerDist[idx];
      if (pd !== 0xFFFF && pd < d) {
        penalty += INTERCEPT_WEIGHT * (1 - pd / d);
      }

      dm[idx] += penalty;
    }
  }

  return dm;
}

// ─── Utility evaluation ───

/** Frames the player needs to move one expanded-grid cell. */
const FRAMES_PER_CELL = 4;          // ANIM_FRAMES

export interface AIResult {
  direction: Direction | -1;
  fireRequested: boolean;
}

/**
 * Compute the best direction for the demo AI to move, plus whether
 * to fire the stun gun this frame.
 */
export function getAIDirection(
  player: PlayerState,
  enemies: EnemyState[],
  gems: GemsState,
  wallmap: Uint8Array,
  timerSec: number,
): AIResult {
  // ── Gun firing logic ──
  // Fire if an active enemy is in line-of-sight along the player's
  // current facing direction.
  let fireRequested = false;
  if (gems.hasGun && (player.gx & 1) && (player.gy & 1)) {
    let gx = player.gx, gy = player.gy;
    const ddx = DIR_DX[player.dir], ddy = DIR_DY[player.dir];
    for (let s = 0; s < ECOLS; s++) {
      gx += ddx; gy += ddy;
      if (gx < 0 || gx >= ECOLS || gy < 0 || gy >= EROWS) break;
      if (wallmap[gy * ECOLS + gx]) break;
      if (enemies.some(e => e.stunFrames === 0 && e.gx === gx && e.gy === gy)) {
        fireRequested = true;
        break;
      }
    }
  }

  // Between cells: keep current direction (updatePlayer ignores input anyway)
  if (!(player.gx & 1) || !(player.gy & 1)) {
    return { direction: player.dir, fireRequested };
  }

  // ── Precompute distance maps ──
  const active: EnemyState[] = [];
  const enemyDists: Uint16Array[] = [];
  for (const e of enemies) {
    if (e.stunFrames > 0) continue;
    active.push(e);
    enemyDists.push(bfsDistances(e.gx, e.gy, wallmap));
  }
  const playerDist = bfsDistances(player.gx, player.gy, wallmap);

  // ── Danger map ──
  const dangerMap = buildDangerMap(active, enemyDists, playerDist);

  // ── Key distances ──
  const exitIdx = gems.exitGy * ECOLS + gems.exitGx;
  const exitDist = playerDist[exitIdx];
  const playerIdx = player.gy * ECOLS + player.gx;

  // How many expanded-grid moves the player can make before time runs out
  const moveBudget = (timerSec * FPS) / FRAMES_PER_CELL;
  // Ratio: distance-to-exit / moves-left. > 1 ≈ can't make it.
  const timeUrgency = exitDist !== 0xFFFF ? exitDist / Math.max(1, moveBudget) : 0;

  // ── Evaluate targets ──
  let bestUtil = -Infinity;
  let bestGx = gems.exitGx;
  let bestGy = gems.exitGy;

  // Gems
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      if (!gems.gemmap[cy * COLS + cx]) continue;
      const gx = cx * 2 + 1;
      const gy = cy * 2 + 1;
      const dist = playerDist[gy * ECOLS + gx];
      if (dist === 0xFFFF || dist === 0) continue;

      // Base value: 10 points per gem, discounted by distance
      let util = 10 / (dist + 1);

      // Danger at the gem: if an enemy can reach it sooner, penalise
      for (const ed of enemyDists) {
        const eDist = ed[gy * ECOLS + gx];
        if (eDist !== 0xFFFF && eDist <= dist + 2) {
          util -= 1.5 * Math.max(0, 1 - eDist / (dist + 4));
        }
      }

      // Still need gems to open exit → boost
      if (!gems.exitOpen) {
        util *= 1.5;
      } else {
        // Exit open: only chase gems if time is comfortable
        if (timeUrgency > 0.6) {
          util *= 0.2;           // heavily discount when time is tight
        } else {
          util *= 0.9;           // slight discount — exit bonus is lucrative
        }
      }

      if (util > bestUtil) { bestUtil = util; bestGx = gx; bestGy = gy; }
    }
  }

  // Exit
  if (gems.exitOpen && exitDist !== 0xFFFF) {
    // Base: time bonus grows with remaining seconds
    let util = timerSec * 0.15 / (exitDist + 1);

    // Urgency boost: as time runs low, strongly favour the exit
    if (timeUrgency > 0.4) util += 8 * timeUrgency * timeUrgency;

    // If very few gems left, no point wandering
    if (gems.gemsLeft <= 2) util += 5 / (exitDist + 1);

    // Slight danger discount near exit (but don't outweigh time pressure)
    for (const ed of enemyDists) {
      const eDist = ed[exitIdx];
      if (eDist !== 0xFFFF && eDist < 6) {
        util -= 0.3;
      }
    }

    if (util > bestUtil) { bestUtil = util; bestGx = gems.exitGx; bestGy = gems.exitGy; }
  }

  // Gun (if not already held)
  if (gems.gunPlaced && !gems.hasGun) {
    const gunIdx = gems.gunGy * ECOLS + gems.gunGx;
    const gunDist = playerDist[gunIdx];
    if (gunDist !== 0xFFFF && gunDist > 0) {
      let util = 4 / (gunDist + 1);
      // More valuable when enemies are close
      let nearCount = 0;
      for (const ed of enemyDists) {
        if (ed[playerIdx] < 12) nearCount++;
      }
      util += nearCount * 2 / (gunDist + 1);

      if (util > bestUtil) { bestUtil = util; bestGx = gems.gunGx; bestGy = gems.gunGy; }
    }
  }

  // ── Flee override ──
  // If the minimum enemy distance to the player is very small and we
  // haven't already picked a strongly positive target, pick the
  // globally safest reachable cell as the destination.
  let minEnemyDist = 0xFFFF;
  for (const ed of enemyDists) {
    if (ed[playerIdx] < minEnemyDist) minEnemyDist = ed[playerIdx];
  }

  if (active.length > 0 && minEnemyDist <= 6 && bestUtil < 1) {
    // Find the cell with the highest minimum-enemy-distance
    let bestSafety = -1;
    for (let idx = 0; idx < GRID_SIZE; idx++) {
      if (wallmap[idx]) continue;
      if (playerDist[idx] === 0xFFFF) continue;
      let minD = 0xFFFF;
      for (const ed of enemyDists) {
        if (ed[idx] < minD) minD = ed[idx];
      }
      if (minD > bestSafety) {
        bestSafety = minD;
        bestGx = idx % ECOLS;
        bestGy = (idx / ECOLS) | 0;
      }
    }
  }

  // ── Bait-and-switch tactic ──
  // When an enemy is approaching along a corridor (medium range), look
  // for a perpendicular side-turn that the player can duck into at the
  // last moment.  The enemy commits to the corridor and overshoots,
  // buying the player time to grab gems or reach the exit.
  //
  // Triggers when:
  //   - An enemy is 3-8 steps away (close enough to be committed but
  //     far enough that the player can still turn)
  //   - The enemy's BFS-optimal direction toward the player is along
  //     one axis (horizontal or vertical)
  //   - A perpendicular corridor exists at the player's position
  //   - The perpendicular corridor leads toward useful targets
  let baitDir: Direction | -1 = -1;

  if (active.length > 0 && minEnemyDist >= 3 && minEnemyDist <= 8) {
    // Find the closest approaching enemy
    let closestEI = -1;
    let closestDist = 0xFFFF;
    for (let ei = 0; ei < active.length; ei++) {
      const d = enemyDists[ei][playerIdx];
      if (d < closestDist) { closestDist = d; closestEI = ei; }
    }

    if (closestEI !== -1) {
      const ce = active[closestEI];
      const dx = player.gx - ce.gx;
      const dy = player.gy - ce.gy;

      // Determine approach axis (which axis the enemy is primarily on)
      const horizontal = Math.abs(dx) > Math.abs(dy);

      // Perpendicular directions to check
      const perpDirs: Direction[] = horizontal
        ? [Direction.Up, Direction.Down]
        : [Direction.Left, Direction.Right];

      let bestPerpScore = -Infinity;

      for (const pd of perpDirs) {
        const nx = player.gx + NDX[pd];
        const ny = player.gy + NDY[pd];
        if (nx < 0 || nx >= ECOLS || ny < 0 || ny >= EROWS) continue;
        if (wallmap[ny * ECOLS + nx]) continue;

        // Check the corridor has some depth (at least 3 passable cells)
        let depth = 0;
        let cx = nx, cy = ny;
        while (depth < 6) {
          cx += NDX[pd]; cy += NDY[pd];
          if (cx < 0 || cx >= ECOLS || cy < 0 || cy >= EROWS) break;
          if (wallmap[cy * ECOLS + cx]) break;
          depth++;
        }
        if (depth < 2) continue;       // dead-end or too short

        // Score this escape route: how safe is it, and are there gems?
        let score = depth * 0.5;       // longer escape corridor = better

        // Check if there are gems along the perpendicular corridor
        let sx = player.gx + NDX[pd], sy = player.gy + NDY[pd];
        for (let step = 0; step < depth + 1; step++) {
          if ((sx & 1) && (sy & 1)) {
            const cidx = (sy >> 1) * COLS + (sx >> 1);
            if (cidx >= 0 && cidx < ROWS * COLS && gems.gemmap[cidx]) {
              score += 2;              // gem bonus
            }
          }
          sx += NDX[pd]; sy += NDY[pd];
          if (sx < 0 || sx >= ECOLS || sy < 0 || sy >= EROWS) break;
          if (wallmap[sy * ECOLS + sx]) break;
        }

        // Ensure the enemy can't easily cut us off via the perpendicular
        const perpIdx = ny * ECOLS + nx;
        const enemyDistToPerp = enemyDists[closestEI][perpIdx];
        if (enemyDistToPerp !== 0xFFFF && enemyDistToPerp <= 3) {
          score -= 5;                  // enemy is too close to the turn
        }

        if (score > bestPerpScore) {
          bestPerpScore = score;
          baitDir = pd;
        }
      }

      // Only use bait-and-switch if it scores well enough
      if (bestPerpScore < 2) baitDir = -1;
    }
  }

  // ── Pathfind with A* ──
  let direction: Direction | -1;

  if (baitDir !== -1) {
    // Bait-and-switch: take the perpendicular escape
    direction = baitDir;
  } else {
    direction = astarFirstStep(player.gx, player.gy, bestGx, bestGy, wallmap, dangerMap);
  }

  return { direction, fireRequested };
}

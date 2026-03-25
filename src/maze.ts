import { COLS, ROWS, ECOLS, EROWS } from './constants.ts';
import type { MazeData } from './types.ts';

/**
 * Generate a maze using the recursive backtracker (DFS) algorithm,
 * then optionally punch extra passages for loops and halls.
 *
 * Ported from the original ZX Spectrum C source (generate_maze + add_extra_passages).
 */
export function generateMaze(extraWallPct: number, extraHallsBase: number, extraHallsRng: number): MazeData {
  const walls = new Uint8Array(ROWS * COLS);
  const wallmap = new Uint8Array(EROWS * ECOLS);

  // Initialize all walls present (bit 0 = right, bit 1 = bottom)
  walls.fill(3);

  // Visited flags
  const vis = new Uint8Array(ROWS * COLS);

  // Explicit stack for DFS
  const stk = new Uint16Array(ROWS * COLS);
  let sp = 0;

  // Start at (0, 0)
  let cx = 0, cy = 0;
  vis[0] = 1;
  stk[sp++] = 0;

  const dirs: number[] = [0, 0, 0, 0];

  while (sp > 0) {
    // Collect unvisited neighbors
    let nd = 0;
    if (cx > 0 && !vis[cy * COLS + cx - 1]) dirs[nd++] = 0;       // left
    if (cx < COLS - 1 && !vis[cy * COLS + cx + 1]) dirs[nd++] = 1; // right
    if (cy > 0 && !vis[(cy - 1) * COLS + cx]) dirs[nd++] = 2;     // up
    if (cy < ROWS - 1 && !vis[(cy + 1) * COLS + cx]) dirs[nd++] = 3; // down

    if (nd === 0) {
      // Backtrack
      sp--;
      if (sp > 0) {
        const t = stk[sp - 1];
        cx = t % COLS;
        cy = (t / COLS) | 0;
      }
      continue;
    }

    // Fisher-Yates shuffle of the first nd directions
    for (let i = nd - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = dirs[i];
      dirs[i] = dirs[j];
      dirs[j] = tmp;
    }

    // Carve in the first random direction
    let nx = cx, ny = cy;
    switch (dirs[0]) {
      case 0: nx--; walls[cy * COLS + nx] &= ~1; break; // remove right wall of left neighbor
      case 1: walls[cy * COLS + cx] &= ~1; nx++; break; // remove right wall of current
      case 2: ny--; walls[ny * COLS + cx] &= ~2; break; // remove bottom wall of upper neighbor
      case 3: walls[cy * COLS + cx] &= ~2; ny++; break; // remove bottom wall of current
    }

    vis[ny * COLS + nx] = 1;
    cx = nx;
    cy = ny;
    stk[sp++] = cy * COLS + cx;
  }

  // Add extra passages (loops and halls)
  addExtraPassages(walls, extraWallPct, extraHallsBase, extraHallsRng);

  // Build expanded wallmap
  buildWallmap(walls, wallmap);

  return { walls, wallmap };
}

/**
 * Punch extra holes in the maze to create loops and 2x2 halls,
 * so the player can dodge enemies. Difficulty controls frequency.
 */
function addExtraPassages(walls: Uint8Array, extraWallPct: number, hallsBase: number, hallsRng: number): void {
  // Pass 1: randomly remove walls to create loops
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = y * COLS + x;
      if (x < COLS - 1 && (walls[idx] & 1) && ((Math.random() * extraWallPct) | 0) === 0) {
        walls[idx] &= ~1;
      }
      if (y < ROWS - 1 && (walls[idx] & 2) && ((Math.random() * extraWallPct) | 0) === 0) {
        walls[idx] &= ~2;
      }
    }
  }

  // Pass 2: create 2x2 halls
  const n = hallsBase + ((Math.random() * (hallsRng + 1)) | 0);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * (COLS - 1)) | 0;
    const y = (Math.random() * (ROWS - 1)) | 0;
    walls[y * COLS + x] &= ~3;          // right + bottom
    walls[y * COLS + x + 1] &= ~2;      // bottom of right neighbor
    walls[(y + 1) * COLS + x] &= ~1;    // right of bottom neighbor
  }
}

/**
 * Expand the compact wall flags into a full grid wallmap.
 * Each maze cell (cx, cy) maps to expanded grid position (2*cx+1, 2*cy+1).
 * Even positions are wall posts / wall segments, odd positions are cell centers.
 */
function buildWallmap(walls: Uint8Array, wallmap: Uint8Array): void {
  wallmap.fill(0);

  for (let gy = 0; gy < EROWS; gy++) {
    for (let gx = 0; gx < ECOLS; gx++) {
      let w = 0;

      if (!(gy & 1) && !(gx & 1)) {
        // Even row, even col = corner post
        if (gy === 0 || gy === ROWS * 2 || gx === 0 || gx === COLS * 2) {
          // Border posts are always walls
          w = 1;
        } else {
          // Interior corner: wall if any adjacent wall segment exists
          const cy = gy >> 1;
          const cx = gx >> 1;
          if ((walls[(cy - 1) * COLS + cx - 1] & 1) ||
              (walls[cy * COLS + cx - 1] & 1) ||
              (walls[(cy - 1) * COLS + cx - 1] & 2) ||
              (walls[(cy - 1) * COLS + cx] & 2)) {
            w = 1;
          }
        }
      } else if (!(gy & 1) && (gx & 1)) {
        // Even row, odd col = horizontal wall segment
        if (gy === 0 || gy === ROWS * 2) {
          w = 1; // top/bottom border
        } else if (walls[((gy >> 1) - 1) * COLS + (gx >> 1)] & 2) {
          w = 1; // bottom wall of cell above
        }
      } else if ((gy & 1) && !(gx & 1)) {
        // Odd row, even col = vertical wall segment
        if (gx === 0 || gx === COLS * 2) {
          w = 1; // left/right border
        } else if (walls[(gy >> 1) * COLS + ((gx >> 1) - 1)] & 1) {
          w = 1; // right wall of cell to the left
        }
      }
      // Odd row, odd col = cell center → always passable (w stays 0)

      wallmap[gy * ECOLS + gx] = w;
    }
  }
}

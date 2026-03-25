import { COLS, ROWS } from './constants.ts';

export interface GemsState {
  /** Gem present at maze cell index (cy * COLS + cx) */
  gemmap: Uint8Array;
  gemsLeft: number;
  gemsCollected: number;
  gemsNeeded: number;
  totalGems: number;
  exitOpen: boolean;
  /** Exit position in expanded grid */
  exitGx: number;
  exitGy: number;
  /** Gun position in expanded grid (-1 if not placed) */
  gunGx: number;
  gunGy: number;
  gunPlaced: boolean;
  hasGun: boolean;
}

/**
 * Place gems, gun, and exit for a new level.
 * playerGx/playerGy are the player's expanded grid position (to avoid placing on top of them).
 */
export function initGems(playerGx: number, playerGy: number): GemsState {
  const gemmap = new Uint8Array(ROWS * COLS);

  // Exit at bottom-right corridor cell
  const exitGx = (COLS - 1) * 2 + 1;
  const exitGy = (ROWS - 1) * 2 + 1;

  const target = Math.floor((ROWS * COLS) * 2 / 5);

  let gemsLeft = 0;

  // Pass 1: spaced placement (no adjacent gems)
  let attempts = 1000;
  while (gemsLeft < target && attempts > 0) {
    attempts--;
    const idx = (Math.random() * ROWS * COLS) | 0;
    if (gemmap[idx]) continue;
    const cy = (idx / COLS) | 0;
    const cx = idx - cy * COLS;
    const gx = cx * 2 + 1;
    const gy = cy * 2 + 1;
    if (gx === playerGx && gy === playerGy) continue;
    if (gx === exitGx && gy === exitGy) continue;
    // No adjacent gems
    if (cx > 0 && gemmap[idx - 1]) continue;
    if (cx < COLS - 1 && gemmap[idx + 1]) continue;
    if (cy > 0 && gemmap[idx - COLS]) continue;
    if (cy < ROWS - 1 && gemmap[idx + COLS]) continue;
    gemmap[idx] = 1;
    gemsLeft++;
  }

  // Pass 2: relax spacing — fill any free cell
  attempts = 1000;
  while (gemsLeft < target && attempts > 0) {
    attempts--;
    const idx = (Math.random() * ROWS * COLS) | 0;
    if (gemmap[idx]) continue;
    const cy = (idx / COLS) | 0;
    const cx = idx - cy * COLS;
    const gx = cx * 2 + 1;
    const gy = cy * 2 + 1;
    if (gx === playerGx && gy === playerGy) continue;
    if (gx === exitGx && gy === exitGy) continue;
    gemmap[idx] = 1;
    gemsLeft++;
  }

  const gemsNeeded = Math.ceil(gemsLeft / 2);

  // Place gun at a random free cell
  let gunGx = -1, gunGy = -1, gunPlaced = false;
  attempts = 50;
  while (attempts > 0) {
    attempts--;
    const cx = (Math.random() * COLS) | 0;
    const cy = (Math.random() * ROWS) | 0;
    const gx = cx * 2 + 1;
    const gy = cy * 2 + 1;
    if (gx === playerGx && gy === playerGy) continue;
    if (gx === exitGx && gy === exitGy) continue;
    if (gemmap[cy * COLS + cx]) continue;
    gunGx = gx;
    gunGy = gy;
    gunPlaced = true;
    break;
  }

  return {
    gemmap,
    gemsLeft,
    gemsCollected: 0,
    gemsNeeded,
    totalGems: gemsLeft,
    exitOpen: false,
    exitGx,
    exitGy,
    gunGx,
    gunGy,
    gunPlaced,
    hasGun: false,
  };
}

/**
 * Try to collect a gem at expanded grid position (gx, gy).
 * Returns true if a gem was collected.
 */
export function tryCollectGem(gems: GemsState, gx: number, gy: number): boolean {
  if (!(gx & 1) || !(gy & 1)) return false; // not a cell center
  const cx = gx >> 1;
  const cy = gy >> 1;
  const idx = cy * COLS + cx;
  if (!gems.gemmap[idx]) return false;

  gems.gemmap[idx] = 0;
  gems.gemsLeft--;
  gems.gemsCollected++;

  if (!gems.exitOpen && gems.gemsCollected >= gems.gemsNeeded) {
    gems.exitOpen = true;
  }

  return true;
}

/**
 * Try to pick up the gun at expanded grid position (gx, gy).
 * Returns true if picked up.
 */
export function tryCollectGun(gems: GemsState, gx: number, gy: number): boolean {
  if (!gems.gunPlaced || gems.hasGun) return false;
  if (gx === gems.gunGx && gy === gems.gunGy) {
    gems.hasGun = true;
    gems.gunPlaced = false;
    return true;
  }
  return false;
}

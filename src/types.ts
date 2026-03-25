export const Direction = {
  Left: 0,
  Right: 1,
  Up: 2,
  Down: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const GamePhase = {
  Menu: 0,
  Playing: 1,
  Win: 2,
  Lose: 3,
  GameOver: 4,
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

/** Wall flags per maze cell: bit 0 = right wall, bit 1 = bottom wall */
export type WallFlags = number;

export interface MazeData {
  /** Wall flags per maze cell [row][col], bit 0=right, bit 1=bottom */
  walls: Uint8Array; // ROWS * COLS
  /** Expanded wallmap: 1=wall, 0=passable. [gy * ECOLS + gx] */
  wallmap: Uint8Array; // EROWS * ECOLS
}

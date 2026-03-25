/** Maze cell grid dimensions */
export const COLS = 14;
export const ROWS = 9;

/** Expanded grid dimensions (each maze cell becomes 2 grid cells + walls) */
export const ECOLS = 2 * COLS + 1; // 29
export const EROWS = 2 * ROWS + 1; // 19

/** Pixel size of each grid cell on the canvas */
export const CELL_SIZE = 24;

/** HUD height in pixels */
export const HUD_HEIGHT = 32;

/** Vertical offset: maze is drawn below the HUD */
export const MAZE_Y = HUD_HEIGHT;

/** Canvas dimensions in pixels */
export const CANVAS_WIDTH = ECOLS * CELL_SIZE;  // 696
export const CANVAS_HEIGHT = MAZE_Y + EROWS * CELL_SIZE; // 488

/** Animation */
export const MOVE_SPEED = 2; // grid sub-steps per frame
export const ANIM_FRAMES = 4; // frames per cell move

/** Timer */
export const FPS = 50; // match ZX Spectrum PAL rate

/** Stun duration in seconds */
export const STUN_SECS = 8;

/** Colors (inspired by ZX Spectrum palette but full RGB) */
export const COLOR = {
  WALL_BRICK: '#CC0000',
  WALL_MORTAR: '#CCCC00',
  CORRIDOR: '#111111',
  CORRIDOR_DOT: '#222222',
  PLAYER: '#00FF00',
  ENEMY: ['#FF0000', '#FF00FF', '#00FFFF', '#FFFFFF'],
  GEM: '#FFFF00',
  GUN: '#00FFFF',
  EXIT_LOCKED: '#880000',
  EXIT_OPEN: '#FFFF00',
  HUD_TEXT: '#FFFFFF',
  HUD_BG: '#000088',
  TIMER_WARN: '#FF0000',
} as const;

/** Difficulty presets */
export interface DifficultyConfig {
  name: string;
  enemies: number;
  enemyFrames: number;
  chasePct: number;
  extraWallPct: number;    // 1-in-N chance to remove a wall
  extraHallsBase: number;
  extraHallsRng: number;
  timeLimit: number;       // seconds
}

export const DIFFICULTIES: DifficultyConfig[] = [
  { name: 'Easy',      enemies: 1, enemyFrames: 8, chasePct: 40, extraWallPct: 3,  extraHallsBase: 5, extraHallsRng: 3, timeLimit: 90 },
  { name: 'Normal',    enemies: 2, enemyFrames: 6, chasePct: 60, extraWallPct: 5,  extraHallsBase: 3, extraHallsRng: 2, timeLimit: 60 },
  { name: 'Hard',      enemies: 3, enemyFrames: 4, chasePct: 80, extraWallPct: 10, extraHallsBase: 1, extraHallsRng: 1, timeLimit: 45 },
  { name: 'Nightmare', enemies: 4, enemyFrames: 3, chasePct: 95, extraWallPct: 20, extraHallsBase: 0, extraHallsRng: 1, timeLimit: 30 },
];

/** Direction deltas: 0=left, 1=right, 2=up, 3=down */
export const DIR_DX = [-1, 1, 0, 0] as const;
export const DIR_DY = [0, 0, -1, 1] as const;

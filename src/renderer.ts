import { COLS, ROWS, ECOLS, EROWS, CELL_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, HUD_HEIGHT, MAZE_Y, COLOR } from './constants.ts';
import { BRICK, FLOOR, GEM, GUN, EXIT, ENEMY_SHAPE, MAN_FRONT_STAND, MAN_FRONT_WALK, MAN_RIGHT_STAND, MAN_RIGHT_WALK, MAN_LEFT_STAND, MAN_LEFT_WALK } from './sprites.ts';
import type { GemsState } from './gems.ts';
import type { EnemyState } from './enemy.ts';
import { Direction } from './types.ts';
import type { MazeData } from './types.ts';
import type { PlayerState } from './player.ts';

/**
 * Pre-render an 8x8 bitmap into a CELL_SIZE × CELL_SIZE ImageData,
 * scaling each pixel to (CELL_SIZE/8) × (CELL_SIZE/8) block.
 */
function bitmapToImageData(
  ctx: CanvasRenderingContext2D,
  bitmap: readonly number[],
  fgColor: string,
  bgColor: string,
): ImageData {
  const scale = CELL_SIZE / 8;
  const img = ctx.createImageData(CELL_SIZE, CELL_SIZE);
  const data = img.data;

  const fg = parseColor(fgColor);
  const bg = parseColor(bgColor);

  for (let row = 0; row < 8; row++) {
    const byte = bitmap[row];
    for (let col = 0; col < 8; col++) {
      const bit = (byte >> (7 - col)) & 1;
      const color = bit ? fg : bg;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = (col * scale + sx);
          const py = (row * scale + sy);
          const idx = (py * CELL_SIZE + px) * 4;
          data[idx] = color[0];
          data[idx + 1] = color[1];
          data[idx + 2] = color[2];
          data[idx + 3] = 255;
        }
      }
    }
  }

  return img;
}

function parseColor(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Cached tile images */
let wallTile: ImageData | null = null;
let floorTile: ImageData | null = null;

function ensureTiles(ctx: CanvasRenderingContext2D): void {
  if (!wallTile) {
    wallTile = bitmapToImageData(ctx, BRICK, COLOR.WALL_BRICK, COLOR.WALL_MORTAR);
  }
  if (!floorTile) {
    floorTile = bitmapToImageData(ctx, FLOOR, COLOR.CORRIDOR_DOT, COLOR.CORRIDOR);
  }
}

/**
 * Draw the full maze on the canvas.
 * Assumes ctx has been translated by MAZE_Y.
 */
export function drawMaze(ctx: CanvasRenderingContext2D, maze: MazeData): void {
  ensureTiles(ctx);

  for (let gy = 0; gy < EROWS; gy++) {
    for (let gx = 0; gx < ECOLS; gx++) {
      const isWall = maze.wallmap[gy * ECOLS + gx];
      const tile = isWall ? wallTile! : floorTile!;
      // putImageData ignores transforms, so add MAZE_Y manually
      ctx.putImageData(tile, gx * CELL_SIZE, MAZE_Y + gy * CELL_SIZE);
    }
  }
}

/** Pick the right sprite bitmap for the player's current direction and walk phase. */
function getPlayerSprite(dir: Direction, walk: number): readonly number[] {
  if (dir === Direction.Left) return walk ? MAN_LEFT_WALK : MAN_LEFT_STAND;
  if (dir === Direction.Right) return walk ? MAN_RIGHT_WALK : MAN_RIGHT_STAND;
  return walk ? MAN_FRONT_WALK : MAN_FRONT_STAND;
}

/**
 * Draw an 8x8 bitmap sprite at pixel position, scaled to CELL_SIZE.
 * Only "on" bits are drawn (transparent background).
 * px/py are in maze-local coordinates (MAZE_Y offset added here).
 */
function drawSprite(ctx: CanvasRenderingContext2D, bitmap: readonly number[], px: number, py: number, color: string): void {
  const scale = CELL_SIZE / 8;
  ctx.fillStyle = color;
  const offy = MAZE_Y;

  for (let row = 0; row < 8; row++) {
    const byte = bitmap[row];
    for (let col = 0; col < 8; col++) {
      if ((byte >> (7 - col)) & 1) {
        ctx.fillRect(px + col * scale, offy + py + row * scale, scale, scale);
      }
    }
  }
}

/**
 * Redraw the background tiles covering a pixel-aligned rectangle.
 * px/py are in maze-local coordinates.
 */
export function eraseTiles(ctx: CanvasRenderingContext2D, px: number, py: number, maze: MazeData): void {
  const gxMin = Math.floor(px / CELL_SIZE);
  const gyMin = Math.floor(py / CELL_SIZE);
  const gxMax = Math.ceil((px + CELL_SIZE) / CELL_SIZE);
  const gyMax = Math.ceil((py + CELL_SIZE) / CELL_SIZE);

  ensureTiles(ctx);
  for (let gy = gyMin; gy < gyMax && gy < EROWS; gy++) {
    for (let gx = gxMin; gx < gxMax && gx < ECOLS; gx++) {
      const isWall = maze.wallmap[gy * ECOLS + gx];
      const tile = isWall ? wallTile! : floorTile!;
      ctx.putImageData(tile, gx * CELL_SIZE, MAZE_Y + gy * CELL_SIZE);
    }
  }
}

/**
 * Draw the player sprite at the current pixel position.
 */
export function drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerState, maze: MazeData): void {
  eraseTiles(ctx, player.px, player.py, maze);

  const sprite = getPlayerSprite(player.dir, player.walk);
  drawSprite(ctx, sprite, player.px, player.py, COLOR.PLAYER);
}

/**
 * Draw all gems, the gun pickup, and the exit gate.
 */
export function drawItems(ctx: CanvasRenderingContext2D, gems: GemsState): void {
  const { gemmap, gunPlaced, gunGx, gunGy, exitGx, exitGy, exitOpen } = gems;

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      if (gemmap[cy * COLS + cx]) {
        const px = (cx * 2 + 1) * CELL_SIZE;
        const py = (cy * 2 + 1) * CELL_SIZE;
        drawSprite(ctx, GEM, px, py, COLOR.GEM);
      }
    }
  }

  if (gunPlaced) {
    drawSprite(ctx, GUN, gunGx * CELL_SIZE, gunGy * CELL_SIZE, COLOR.GUN);
  }

  const exitColor = exitOpen ? COLOR.EXIT_OPEN : COLOR.EXIT_LOCKED;
  drawSprite(ctx, EXIT, exitGx * CELL_SIZE, exitGy * CELL_SIZE, exitColor);
}

/**
 * Redraw any items that overlap the given pixel area.
 */
export function redrawItemsNear(ctx: CanvasRenderingContext2D, px: number, py: number, gems: GemsState): void {
  const gxMin = Math.floor(px / CELL_SIZE);
  const gyMin = Math.floor(py / CELL_SIZE);
  const gxMax = Math.ceil((px + CELL_SIZE) / CELL_SIZE);
  const gyMax = Math.ceil((py + CELL_SIZE) / CELL_SIZE);

  for (let gy = gyMin; gy < gyMax && gy < EROWS; gy++) {
    for (let gx = gxMin; gx < gxMax && gx < ECOLS; gx++) {
      if ((gx & 1) && (gy & 1)) {
        const cx = gx >> 1;
        const cy = gy >> 1;
        if (gems.gemmap[cy * COLS + cx]) {
          drawSprite(ctx, GEM, gx * CELL_SIZE, gy * CELL_SIZE, COLOR.GEM);
        }
      }
    }
  }

  if (gems.gunPlaced &&
      gems.gunGx >= gxMin && gems.gunGx < gxMax &&
      gems.gunGy >= gyMin && gems.gunGy < gyMax) {
    drawSprite(ctx, GUN, gems.gunGx * CELL_SIZE, gems.gunGy * CELL_SIZE, COLOR.GUN);
  }

  if (gems.exitGx >= gxMin && gems.exitGx < gxMax &&
      gems.exitGy >= gyMin && gems.exitGy < gyMax) {
    const exitColor = gems.exitOpen ? COLOR.EXIT_OPEN : COLOR.EXIT_LOCKED;
    drawSprite(ctx, EXIT, gems.exitGx * CELL_SIZE, gems.exitGy * CELL_SIZE, exitColor);
  }
}

/**
 * Draw an enemy sprite. Stunned enemies blink.
 */
export function drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyState, index: number, frameCount: number, maze: MazeData): void {
  eraseTiles(ctx, enemy.px, enemy.py, maze);

  if (enemy.stunFrames > 0 && (frameCount & 4)) return;

  const color = COLOR.ENEMY[index % COLOR.ENEMY.length];
  drawSprite(ctx, ENEMY_SHAPE, enemy.px, enemy.py, color);
}

/**
 * Draw a shot line along a path.
 */
export function drawShotLine(ctx: CanvasRenderingContext2D, path: Array<{ gx: number; gy: number }>): void {
  ctx.fillStyle = COLOR.GUN;
  for (const { gx, gy } of path) {
    ctx.fillRect(gx * CELL_SIZE, MAZE_Y + gy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }
}

/**
 * Erase a shot line by redrawing floor tiles.
 */
export function eraseShotLine(ctx: CanvasRenderingContext2D, path: Array<{ gx: number; gy: number }>, maze: MazeData): void {
  ensureTiles(ctx);
  for (const { gx, gy } of path) {
    const isWall = maze.wallmap[gy * ECOLS + gx];
    const tile = isWall ? wallTile! : floorTile!;
    ctx.putImageData(tile, gx * CELL_SIZE, MAZE_Y + gy * CELL_SIZE);
  }
}

/**
 * Draw the HUD bar at the top of the screen.
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  score: number,
  level: number,
  gemsToGo: number,
  timerSec: number,
  hasGun: boolean,
  timerWarn: boolean,
): void {
  // Background
  ctx.fillStyle = COLOR.HUD_BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);

  ctx.font = 'bold 18px monospace';
  ctx.textBaseline = 'middle';
  const y = HUD_HEIGHT / 2;

  // Score
  ctx.fillStyle = COLOR.HUD_TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE:${String(score).padStart(6, '0')}`, 8, y);

  // Level
  ctx.fillText(`LVL:${level}`, 210, y);

  // Gems to go
  ctx.fillStyle = COLOR.GEM;
  ctx.fillText(`GEMS:${gemsToGo}`, 310, y);

  // Gun indicator
  if (hasGun) {
    ctx.fillStyle = COLOR.GUN;
    ctx.fillText('GUN', 440, y);
  }

  // Timer
  ctx.fillStyle = timerWarn ? COLOR.TIMER_WARN : COLOR.HUD_TEXT;
  ctx.textAlign = 'right';
  ctx.fillText(`TIME:${String(timerSec).padStart(3, ' ')}`, CANVAS_WIDTH - 8, y);
}

/**
 * Draw a centered overlay message.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, lines: Array<{ text: string; color: string; size: number }>): void {
  ctx.fillStyle = '#000000AA';
  ctx.fillRect(0, MAZE_Y, CANVAS_WIDTH, EROWS * CELL_SIZE);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerY = MAZE_Y + (EROWS * CELL_SIZE) / 2;

  let y = centerY - ((lines.length - 1) * 25);
  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = `bold ${line.size}px monospace`;
    ctx.fillText(line.text, CANVAS_WIDTH / 2, y);
    y += line.size + 10;
  }
}

/**
 * Draw a sprite icon at a fixed position (for the menu cast section).
 * px/py are absolute canvas coordinates.
 */
function drawSpriteAbsolute(ctx: CanvasRenderingContext2D, bitmap: readonly number[], px: number, py: number, color: string): void {
  const scale = CELL_SIZE / 8;
  ctx.fillStyle = color;
  for (let row = 0; row < 8; row++) {
    const byte = bitmap[row];
    for (let col = 0; col < 8; col++) {
      if ((byte >> (7 - col)) & 1) {
        ctx.fillRect(px + col * scale, py + row * scale, scale, scale);
      }
    }
  }
}

/**
 * Draw a tile icon at a fixed position (for the menu cast section).
 * px/py are absolute canvas coordinates.
 */
function drawTileAbsolute(ctx: CanvasRenderingContext2D, bitmap: readonly number[], fgColor: string, bgColor: string, px: number, py: number): void {
  ensureTiles(ctx);
  const img = bitmapToImageData(ctx, bitmap, fgColor, bgColor);
  ctx.putImageData(img, px, py);
}

/**
 * Draw the title/menu screen with "The Cast" character showcase.
 */
export function drawMenu(ctx: CanvasRenderingContext2D, selectedDifficulty: number, diffNames: string[]): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = CANVAS_WIDTH / 2;

  // Title
  ctx.fillStyle = COLOR.GEM;
  ctx.font = 'bold 48px monospace';
  ctx.fillText('MAZE RUNNER', cx, 40);

  // --- The Cast ---
  ctx.fillStyle = COLOR.GEM;
  ctx.font = 'bold 18px monospace';
  ctx.fillText('--- The Cast ---', cx, 75);

  const castLeft = 140;
  const castTextX = castLeft + CELL_SIZE + 12;
  const castEntries: Array<{ bitmap: readonly number[]; color: string; label: string; tile?: { fg: string; bg: string } }> = [
    { bitmap: MAN_FRONT_STAND, color: COLOR.PLAYER, label: 'YOU    Escape the maze alive!' },
    { bitmap: ENEMY_SHAPE, color: COLOR.ENEMY[0], label: 'GHOST  Hunts you & steals gems' },
    { bitmap: GEM, color: COLOR.GEM, label: 'GEM    Grab enough to open exit' },
    { bitmap: EXIT, color: COLOR.EXIT_LOCKED, label: 'EXIT   Locked until quota met' },
    { bitmap: GUN, color: COLOR.GUN, label: 'GUN    Stun ghosts for 8 sec' },
    { bitmap: BRICK, color: COLOR.WALL_BRICK, label: 'WALL   Don\'t get cornered!', tile: { fg: COLOR.WALL_BRICK, bg: COLOR.WALL_MORTAR } },
  ];

  const castStartY = 95;
  const castSpacing = 28;
  ctx.textAlign = 'left';
  ctx.font = '16px monospace';

  for (let i = 0; i < castEntries.length; i++) {
    const entry = castEntries[i];
    const y = castStartY + i * castSpacing;
    if (entry.tile) {
      drawTileAbsolute(ctx, entry.bitmap, entry.tile.fg, entry.tile.bg, castLeft, y);
    } else {
      drawSpriteAbsolute(ctx, entry.bitmap, castLeft, y, entry.color);
    }
    ctx.fillStyle = entry.color;
    ctx.fillText(entry.label, castTextX, y + CELL_SIZE / 2);
  }

  // Controls
  ctx.textAlign = 'center';
  ctx.fillStyle = '#888888';
  ctx.font = '16px monospace';
  ctx.fillText('Arrow keys = move    Ctrl = fire gun', cx, 275);

  // Difficulty selection
  ctx.fillStyle = COLOR.HUD_TEXT;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('SELECT DIFFICULTY:', cx, 310);

  for (let i = 0; i < diffNames.length; i++) {
    const y = 345 + i * 34;
    if (i === selectedDifficulty) {
      ctx.fillStyle = COLOR.PLAYER;
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`> ${diffNames[i]} <`, cx, y);
    } else {
      ctx.fillStyle = COLOR.HUD_TEXT;
      ctx.font = '20px monospace';
      ctx.fillText(diffNames[i], cx, y);
    }
  }

  ctx.fillStyle = '#888888';
  ctx.font = '16px monospace';
  ctx.fillText('Up/Down to select, Enter to start', cx, CANVAS_HEIGHT - 10);
}

/**
 * Draw the high scores screen.
 */
export function drawHighScores(
  ctx: CanvasRenderingContext2D,
  scores: Array<{ score: number; level: number }>,
  newRank: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = CANVAS_WIDTH / 2;

  // Title
  ctx.fillStyle = COLOR.GEM;
  ctx.font = 'bold 40px monospace';
  ctx.fillText('HIGH SCORES', cx, 60);

  ctx.font = 'bold 22px monospace';
  for (let i = 0; i < scores.length; i++) {
    const y = 130 + i * 50;
    const entry = scores[i];

    ctx.fillStyle = (i === newRank) ? COLOR.PLAYER : COLOR.GEM;

    if (entry.score === 0) {
      ctx.fillText(`${i + 1}.  ------`, cx, y);
    } else {
      const scoreStr = String(entry.score).padStart(6, '0');
      ctx.fillText(`${i + 1}.  ${scoreStr}   Level ${entry.level}`, cx, y);
    }
  }

  ctx.fillStyle = '#888888';
  ctx.font = '18px monospace';
  ctx.fillText('Press any key to continue', cx, CANVAS_HEIGHT - 30);
}

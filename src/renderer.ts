import { COLS, ROWS, ECOLS, EROWS, CELL_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, HUD_HEIGHT, MAZE_Y, COLOR } from './constants.ts';
import { BRICK, FLOOR, GEM, GUN, EXIT, SKULL_FRONT_STAND, SKULL_FRONT_WALK, SKULL_RIGHT_STAND, SKULL_RIGHT_WALK, SKULL_LEFT_STAND, SKULL_LEFT_WALK, MAN_FRONT_STAND, MAN_FRONT_WALK, MAN_RIGHT_STAND, MAN_RIGHT_WALK, MAN_LEFT_STAND, MAN_LEFT_WALK } from './sprites.ts';
import type { GemsState } from './gems.ts';
import type { EnemyState } from './enemy.ts';
import { Direction } from './types.ts';
import type { MazeData } from './types.ts';
import type { PlayerState } from './player.ts';

// ─── Zoom rendering state ───
// _zoom: 1 = normal, 2 = zoomed.  _camX/_camY: camera in zoomed-pixel coords.
let _zoom = 1;
let _camX = 0;
let _camY = 0;

export function setZoomRender(zoom: number, camX: number, camY: number): void {
  _zoom = zoom;
  _camX = camX;
  _camY = camY;
}

export function resetZoomRender(): void {
  _zoom = 1;
  _camX = 0;
  _camY = 0;
}

/**
 * Pre-render an 8x8 bitmap into a size × size ImageData,
 * scaling each pixel to (size/8) × (size/8) block.
 */
function bitmapToImageData(
  ctx: CanvasRenderingContext2D,
  bitmap: readonly number[],
  fgColor: string,
  bgColor: string,
  size = CELL_SIZE,
): ImageData {
  const scale = size / 8;
  const img = ctx.createImageData(size, size);
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
          const idx = (py * size + px) * 4;
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

/** Cached tile images — normal (CELL_SIZE) and zoomed (CELL_SIZE*2) */
let wallTile: ImageData | null = null;
let floorTile: ImageData | null = null;
const ZOOM_CELL = CELL_SIZE * 2;
let zoomWallTile: ImageData | null = null;
let zoomFloorTile: ImageData | null = null;

function ensureTiles(ctx: CanvasRenderingContext2D): void {
  if (!wallTile) {
    wallTile = bitmapToImageData(ctx, BRICK, COLOR.WALL_BRICK, COLOR.WALL_MORTAR);
  }
  if (!floorTile) {
    floorTile = bitmapToImageData(ctx, FLOOR, COLOR.CORRIDOR_DOT, COLOR.CORRIDOR);
  }
  if (!zoomWallTile) {
    zoomWallTile = bitmapToImageData(ctx, BRICK, COLOR.WALL_BRICK, COLOR.WALL_MORTAR, ZOOM_CELL);
  }
  if (!zoomFloorTile) {
    zoomFloorTile = bitmapToImageData(ctx, FLOOR, COLOR.CORRIDOR_DOT, COLOR.CORRIDOR, ZOOM_CELL);
  }
}

/** Return the right tile ImageData for current zoom level. */
function getTile(isWall: boolean): ImageData {
  if (_zoom > 1) return isWall ? zoomWallTile! : zoomFloorTile!;
  return isWall ? wallTile! : floorTile!;
}

/**
 * Draw the maze on the canvas. Optional range params limit to visible cells.
 */
export function drawMaze(ctx: CanvasRenderingContext2D, maze: MazeData, gxMin = 0, gyMin = 0, gxMax = ECOLS, gyMax = EROWS): void {
  ensureTiles(ctx);
  const cellSz = CELL_SIZE * _zoom;

  for (let gy = gyMin; gy < gyMax; gy++) {
    for (let gx = gxMin; gx < gxMax; gx++) {
      const tile = getTile(!!maze.wallmap[gy * ECOLS + gx]);
      ctx.putImageData(tile, gx * cellSz - _camX, MAZE_Y + gy * cellSz - _camY);
    }
  }
}

/** Pick the right ghost sprite bitmap for an enemy's current direction and walk phase. */
function getGhostSprite(dir: Direction, walk: number): readonly number[] {
  if (dir === Direction.Left) return walk ? SKULL_LEFT_WALK : SKULL_LEFT_STAND;
  if (dir === Direction.Right) return walk ? SKULL_RIGHT_WALK : SKULL_RIGHT_STAND;
  return walk ? SKULL_FRONT_WALK : SKULL_FRONT_STAND;
}

/** Pick the right sprite bitmap for the player's current direction and walk phase. */
function getPlayerSprite(dir: Direction, walk: number): readonly number[] {
  if (dir === Direction.Left) return walk ? MAN_LEFT_WALK : MAN_LEFT_STAND;
  if (dir === Direction.Right) return walk ? MAN_RIGHT_WALK : MAN_RIGHT_STAND;
  return walk ? MAN_FRONT_WALK : MAN_FRONT_STAND;
}

/**
 * Draw an 8x8 bitmap sprite at pixel position, scaled for current zoom.
 * Only "on" bits are drawn (transparent background).
 * px/py are in maze-local coordinates (original scale).
 */
function drawSprite(ctx: CanvasRenderingContext2D, bitmap: readonly number[], px: number, py: number, color: string): void {
  const scale = CELL_SIZE * _zoom / 8;
  ctx.fillStyle = color;

  for (let row = 0; row < 8; row++) {
    const byte = bitmap[row];
    for (let col = 0; col < 8; col++) {
      if ((byte >> (7 - col)) & 1) {
        ctx.fillRect(
          px * _zoom - _camX + col * scale,
          MAZE_Y + py * _zoom - _camY + row * scale,
          scale, scale,
        );
      }
    }
  }
}

/**
 * Redraw the background tiles covering a pixel-aligned rectangle.
 * px/py are in maze-local coordinates (original scale).
 */
export function eraseTiles(ctx: CanvasRenderingContext2D, px: number, py: number, maze: MazeData): void {
  const gxMin = Math.floor(px / CELL_SIZE);
  const gyMin = Math.floor(py / CELL_SIZE);
  const gxMax = Math.ceil((px + CELL_SIZE) / CELL_SIZE);
  const gyMax = Math.ceil((py + CELL_SIZE) / CELL_SIZE);
  const cellSz = CELL_SIZE * _zoom;

  ensureTiles(ctx);
  for (let gy = gyMin; gy < gyMax && gy < EROWS; gy++) {
    for (let gx = gxMin; gx < gxMax && gx < ECOLS; gx++) {
      const tile = getTile(!!maze.wallmap[gy * ECOLS + gx]);
      ctx.putImageData(tile, gx * cellSz - _camX, MAZE_Y + gy * cellSz - _camY);
    }
  }
}

/**
 * Draw the player sprite at the current pixel position.
 * skipErase: in zoomed full-redraw mode, tiles are already drawn.
 */
export function drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerState, maze: MazeData, skipErase = false): void {
  if (!skipErase) eraseTiles(ctx, player.px, player.py, maze);

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
 * skipErase: in zoomed full-redraw mode, tiles are already drawn.
 */
export function drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyState, index: number, frameCount: number, maze: MazeData, skipErase = false): void {
  if (!skipErase) eraseTiles(ctx, enemy.px, enemy.py, maze);

  if (enemy.stunFrames > 0 && (frameCount & 4)) return;

  const color = COLOR.ENEMY[index % COLOR.ENEMY.length];
  drawSprite(ctx, getGhostSprite(enemy.dir, enemy.walk), enemy.px, enemy.py, color);
}

/**
 * Draw a shot line along a path.
 */
export function drawShotLine(ctx: CanvasRenderingContext2D, path: Array<{ gx: number; gy: number }>): void {
  const cellSz = CELL_SIZE * _zoom;
  ctx.fillStyle = COLOR.GUN;
  for (const { gx, gy } of path) {
    ctx.fillRect(gx * cellSz - _camX, MAZE_Y + gy * cellSz - _camY, cellSz, cellSz);
  }
}

/**
 * Erase a shot line by redrawing floor tiles.
 */
export function eraseShotLine(ctx: CanvasRenderingContext2D, path: Array<{ gx: number; gy: number }>, maze: MazeData): void {
  const cellSz = CELL_SIZE * _zoom;
  ensureTiles(ctx);
  for (const { gx, gy } of path) {
    const tile = getTile(!!maze.wallmap[gy * ECOLS + gx]);
    ctx.putImageData(tile, gx * cellSz - _camX, MAZE_Y + gy * cellSz - _camY);
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
  isDemo = false,
  zoom = false,
): void {
  // Background
  ctx.fillStyle = COLOR.HUD_BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);

  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.textBaseline = 'middle';
  const y = HUD_HEIGHT / 2;

  // Score
  ctx.fillStyle = COLOR.HUD_TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE:${String(score).padStart(6, '0')}`, 8, y);

  // Level
  ctx.fillText(`LVL:${level}`, 195, y);

  // Gems to go
  ctx.fillStyle = COLOR.GEM;
  ctx.fillText(`GEMS TO GO:${gemsToGo}`, 280, y);

  // Gun indicator
  if (hasGun) {
    ctx.fillStyle = COLOR.GUN;
    ctx.fillText('GUN', 470, y);
  }

  // Timer
  ctx.textAlign = 'right';
  ctx.fillStyle = timerWarn ? COLOR.TIMER_WARN : COLOR.HUD_TEXT;
  const mins = Math.floor(timerSec / 60);
  const secs = timerSec % 60;
  const timeStr = `TIME: ${mins}:${String(secs).padStart(2, '0')}`;
  const timeX = CANVAS_WIDTH - 8;
  ctx.fillText(timeStr, timeX, y);

  // DEMO / ZOOM label (left of timer)
  if (isDemo) {
    const timeW = ctx.measureText(timeStr).width;
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('DEMO', timeX - timeW - 16, y);
  } else if (zoom) {
    const timeW = ctx.measureText(timeStr).width;
    ctx.fillStyle = '#FFFF00';
    ctx.fillText('ZOOM', timeX - timeW - 16, y);
  }

}

/**
 * Draw a ZX Spectrum-style paper banner overlay.
 * Ignores line.size — uses fixed pixel-font sizes to match retro aesthetic.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, lines: Array<{ text: string; color: string; size: number }>): void {
  const margin = 20;
  const BORDER = 6;
  const BANNER_H = 6 * CELL_SIZE; // 144 px
  const bannerY = MAZE_Y + Math.floor((EROWS * CELL_SIZE - BANNER_H) / 2);

  // Paper colour: red for game-over, dark green for level-won
  const fc = lines[0].color.toLowerCase();
  const isSuccess = fc === '#00ff00' || fc === '#00cc00';
  const paperColor = isSuccess ? '#005500' : '#AA0000';

  // Yellow outer border
  ctx.fillStyle = '#FFFF00';
  ctx.fillRect(margin, bannerY, CANVAS_WIDTH - margin * 2, BANNER_H);

  // Coloured paper interior
  ctx.fillStyle = paperColor;
  ctx.fillRect(BORDER + margin, bannerY + BORDER, CANVAS_WIDTH - (BORDER + margin) * 2, BANNER_H - BORDER * 2);

  // Text layout
  const TITLE_SIZE = 20;
  const LINE_SIZE  = 14;
  const PROMPT_SIZE = 13;
  const GAP = 8;

  const innerH = BANNER_H - BORDER * 2;
  const totalTextH = TITLE_SIZE + GAP
    + (lines.length - 1) * (LINE_SIZE + 4)
    + GAP + PROMPT_SIZE;
  let y = bannerY + BORDER + Math.floor((innerH - totalTextH) / 2) + TITLE_SIZE / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = CANVAS_WIDTH / 2;

  // Title with ×× decoration
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${TITLE_SIZE}px 'Press Start 2P', monospace`;
  ctx.fillText(`\u00D7\u00D7 ${lines[0].text} \u00D7\u00D7`, cx, y);
  y += TITLE_SIZE + GAP;

  // Remaining lines
  ctx.font = `${LINE_SIZE}px 'Press Start 2P', monospace`;
  for (let i = 1; i < lines.length; i++) {
    ctx.fillText(lines[i].text, cx, y);
    y += LINE_SIZE + 4;
  }

  // "Press any button." prompt
  y += GAP;
  ctx.font = `${PROMPT_SIZE}px 'Press Start 2P', monospace`;
  ctx.fillText('Press any button.', cx, y);
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

  // Difficulty selection (top)
  ctx.fillStyle = COLOR.HUD_TEXT;
  ctx.font = "16px 'Press Start 2P', monospace";
  ctx.fillText('SELECT DIFFICULTY:', cx, 40);

  for (let i = 0; i < diffNames.length; i++) {
    const y = 80 + i * 38;
    if (i === selectedDifficulty) {
      ctx.fillStyle = COLOR.PLAYER;
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.fillText(`> ${diffNames[i]} <`, cx, y);
    } else {
      ctx.fillStyle = COLOR.HUD_TEXT;
      ctx.font = "14px 'Press Start 2P', monospace";
      ctx.fillText(diffNames[i], cx, y);
    }
  }

  // --- The Cast ---
  const castHeaderY = 80 + (diffNames.length - 1) * 38 + 80;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR.GEM;
  ctx.font = "14px 'Press Start 2P', monospace";
  ctx.fillText('--- The Cast ---', cx, castHeaderY);

  const castLeft = 140;
  const castTextX = castLeft + CELL_SIZE + 12;
  const castEntries: Array<{ bitmap: readonly number[]; color: string; label: string; tile?: { fg: string; bg: string } }> = [
    { bitmap: MAN_FRONT_STAND, color: COLOR.PLAYER, label: 'YOU    Escape the maze alive!' },
    { bitmap: SKULL_FRONT_STAND, color: COLOR.ENEMY[0], label: 'GHOST  Hunts you & steals gems' },
    { bitmap: GEM, color: COLOR.GEM, label: 'GEM    Grab enough to open exit' },
    { bitmap: EXIT, color: COLOR.EXIT_LOCKED, label: 'EXIT   Locked until quota met' },
    { bitmap: GUN, color: COLOR.GUN, label: 'GUN    Stun ghosts for 8 sec' },
    { bitmap: BRICK, color: COLOR.WALL_BRICK, label: 'WALL   Don\'t get cornered!', tile: { fg: COLOR.WALL_BRICK, bg: COLOR.WALL_MORTAR } },
  ];

  const castStartY = castHeaderY + 26;
  const castSpacing = 30;
  ctx.textAlign = 'left';
  ctx.font = "12px 'Press Start 2P', monospace";

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

  ctx.textAlign = 'center';
  ctx.fillStyle = '#888888';
  ctx.font = "12px 'Press Start 2P', monospace";
  ctx.fillText('Up/Down to select, Enter to start', cx, CANVAS_HEIGHT - 14);

}

/** Cache: attrColor → { wall: ImageData, floor: ImageData } — avoids re-allocating per cell per frame */
const attrCache = new Map<string, { wall: ImageData; floor: ImageData }>();

function getAttrTiles(ctx: CanvasRenderingContext2D, attrColor: string) {
  let entry = attrCache.get(attrColor);
  if (!entry) {
    entry = {
      wall:  bitmapToImageData(ctx, BRICK, attrColor, '#000000'),
      floor: bitmapToImageData(ctx, FLOOR, attrColor, '#000000'),
    };
    attrCache.set(attrColor, entry);
  }
  return entry;
}

/**
 * Re-draw a single tile using a ZX Spectrum-style attribute colour:
 * the tile bitmap (brick or floor) is rendered with attrColor as ink and
 * black as paper, so the pixel pattern stays visible but changes hue.
 */
export function drawCellAttr(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  isWall: boolean,
  attrColor: string,
): void {
  const tiles = getAttrTiles(ctx, attrColor);
  const cellSz = CELL_SIZE * _zoom;
  ctx.putImageData(isWall ? tiles.wall : tiles.floor, gx * cellSz - _camX, MAZE_Y + gy * cellSz - _camY);
}

/**
 * Re-draw any sprites (gems, gun, exit, enemies, player) at a grid cell
 * in attrColor, for the level-presentation attribute flash effect.
 */
export function drawSpritesAtCellAttr(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  gems: GemsState,
  enemies: EnemyState[],
  player: PlayerState,
  attrColor: string,
): void {
  if ((gx & 1) && (gy & 1) && gems.gemmap[(gy >> 1) * COLS + (gx >> 1)]) {
    drawSprite(ctx, GEM, gx * CELL_SIZE, gy * CELL_SIZE, attrColor);
  }
  if (gems.gunPlaced && gems.gunGx === gx && gems.gunGy === gy) {
    drawSprite(ctx, GUN, gx * CELL_SIZE, gy * CELL_SIZE, attrColor);
  }
  if (gems.exitGx === gx && gems.exitGy === gy) {
    drawSprite(ctx, EXIT, gx * CELL_SIZE, gy * CELL_SIZE, attrColor);
  }
  for (const e of enemies) {
    if (e.gx === gx && e.gy === gy) {
      drawSprite(ctx, SKULL_FRONT_STAND, e.px, e.py, attrColor);
    }
  }
  if (player.gx === gx && player.gy === gy) {
    drawSprite(ctx, getPlayerSprite(player.dir, player.walk), player.px, player.py, attrColor);
  }
}

/**
 * Draw the HUD during level presentation (label replaces gems/gun/timer).
 */
export function drawPresentHud(ctx: CanvasRenderingContext2D, score: number, level: number, label: string, color: string): void {
  ctx.fillStyle = COLOR.HUD_BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);

  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.textBaseline = 'middle';
  const y = HUD_HEIGHT / 2;

  ctx.fillStyle = COLOR.HUD_TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE:${String(score).padStart(6, '0')}`, 8, y);
  ctx.fillText(`LVL:${level}`, 195, y);

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(label, CANVAS_WIDTH / 2, y);
}

/**
 * Draw the high scores screen.
 */
export function drawNameEntry(
  ctx: CanvasRenderingContext2D,
  rank: number,
  score: number,
  currentText: string,
  tick: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cx = CANVAS_WIDTH / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLOR.GEM;
  ctx.font = "20px 'Press Start 2P', monospace";
  ctx.fillText('HIGH SCORE!', cx, 90);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = "14px 'Press Start 2P', monospace";
  ctx.fillText(`RANK #${rank + 1}   SCORE: ${String(score).padStart(6, '0')}`, cx, 155);

  ctx.fillStyle = '#AAAAAA';
  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.fillText('ENTER YOUR NAME:', cx, 235);

  // Name with blinking cursor
  const cursor = (tick >> 2) & 1 ? '_' : ' ';
  const nameDisplay = (currentText || '') + cursor;
  ctx.fillStyle = COLOR.PLAYER;
  ctx.font = "18px 'Press Start 2P', monospace";
  ctx.fillText(nameDisplay.toUpperCase(), cx, 290);

  ctx.fillStyle = '#888888';
  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.fillText('PRESS ENTER TO CONFIRM', cx, CANVAS_HEIGHT - 40);
}

export function drawHighScores(
  ctx: CanvasRenderingContext2D,
  scores: Array<{ score: number; level: number; name: string }>,
  newRank: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = CANVAS_WIDTH / 2;

  // Title
  ctx.fillStyle = COLOR.GEM;
  ctx.font = "20px 'Press Start 2P', monospace";
  ctx.fillText('HIGH SCORES', cx, 60);

  ctx.font = "14px 'Press Start 2P', monospace";
  for (let i = 0; i < scores.length; i++) {
    const y = 135 + i * 55;
    const entry = scores[i];

    ctx.fillStyle = (i === newRank) ? COLOR.PLAYER : COLOR.GEM;

    if (entry.score === 0) {
      ctx.fillText(`${i + 1}.  ----------`, cx, y);
    } else {
      const scoreStr = String(entry.score).padStart(6, '0');
      const name = (entry.name || '').substring(0, 10).toUpperCase().padEnd(10, ' ');
      ctx.fillText(`${i + 1}. ${name}  ${scoreStr}  L${entry.level}`, cx, y);
    }
  }

  ctx.fillStyle = '#888888';
  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.fillText('Press any key to continue', cx, CANVAS_HEIGHT - 30);
}

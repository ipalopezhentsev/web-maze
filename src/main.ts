import './style.css';
import { CANVAS_WIDTH, CANVAS_HEIGHT, CELL_SIZE, HUD_HEIGHT, FPS, DIFFICULTIES, ECOLS, EROWS, COLOR } from './constants.ts';
import { generateMaze } from './maze.ts';
import {
  drawMaze, drawPlayer, drawItems, drawEnemy, drawShotLine, eraseShotLine,
  eraseTiles, redrawItemsNear, drawHud, drawOverlay, drawMenu, drawHighScores,
  drawNameEntry, drawPresentHud, drawCellAttr, drawSpritesAtCellAttr,
  setZoomRender, resetZoomRender,
} from './renderer.ts';
import { initInput, getDirection, isFirePressed, startTextInput, stopTextInput, drainTextInput } from './input.ts';
import { createPlayer, updatePlayer } from './player.ts';
import { initGems, tryCollectGem, tryCollectGun } from './gems.ts';
import type { GemsState } from './gems.ts';
import { createEnemies, updateEnemies, fireGun } from './enemy.ts';
import type { EnemiesContext } from './enemy.ts';
import { getAIDirection } from './ai.ts';
import { Direction } from './types.ts';
import type { MazeData } from './types.ts';
import type { PlayerState } from './player.ts';
import { initSound, isMuted, toggleMute, sndStep, sndThump, sndGem, sndGunPickup, sndShot, sndShotHit, sndExitOpen, sndCaught, sndWin, sndTimeUp } from './sound.ts';
import { loadHiScores, getHiScores, updateHiScores, loadPlayerName, savePlayerName } from './hiscore.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const ctx2d = canvas.getContext('2d')!;
ctx2d.imageSmoothingEnabled = false;

// Unlock Web Audio on first user gesture (required on iOS/Safari).
// Must be document-level and include touchstart — iOS doesn't always fire pointerdown.
const soundPrompt = document.getElementById('sound-prompt') as HTMLElement;
const unlockAudio = () => {
  initSound();
  soundPrompt.style.display = 'none';
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('pointerdown', unlockAudio);
};
document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
document.addEventListener('pointerdown', unlockAudio, { once: true });

let zoomMode = true;
let cameraX = 0;
let cameraY = 0;

// Zoom-in transition (normal → zoomed at level start)
const zoomTransCanvas = document.createElement('canvas');
zoomTransCanvas.width = CANVAS_WIDTH;
zoomTransCanvas.height = CANVAS_HEIGHT - HUD_HEIGHT;
const zoomTransCtx = zoomTransCanvas.getContext('2d')!;
let zoomTransFrame = 0;
const ZOOM_IN_FRAMES = 30; // 0.6 s at 50 fps

// Pre-rendered 2× maze background (static tiles only; rebuilt once per level)
const zoomedMazeCanvas = document.createElement('canvas');
zoomedMazeCanvas.width = ECOLS * CELL_SIZE * 2;
zoomedMazeCanvas.height = EROWS * CELL_SIZE * 2;
const zoomedMazeCtx = zoomedMazeCanvas.getContext('2d')!;

// Countdown state ("READY… SET… GO!")
let countdownFrame = 0;
const COUNTDOWN_WORDS = [
  { text: 'READY', frames: 30, color: '#FFFF00' },
  { text: 'SET',   frames: 24, color: '#FF8800' },
  { text: 'GO!',   frames: 20, color: '#00FF00' },
] as const;
// Pre-rendered text images for each countdown word (filled on first use)
const countdownTextImgs: HTMLCanvasElement[] = [];
// Snapshot of maze during countdown (avoids per-frame maze redraw)
const countdownBgCanvas = document.createElement('canvas');
countdownBgCanvas.width = CANVAS_WIDTH;
countdownBgCanvas.height = CANVAS_HEIGHT;

function scaleCanvas(): void {
  const isWide = window.innerWidth > 900;
  const sidebar = document.querySelector('.sidebar') as HTMLElement | null;
  const sidebarW = isWide && sidebar ? sidebar.offsetWidth + 24 : 0; // 24 = flex gap
  const sidebarH = !isWide && sidebar ? sidebar.offsetHeight + 16 : 0; // stacked above canvas in narrow mode
  const header = document.querySelector('header') as HTMLElement | null;
  const footer = document.querySelector('footer') as HTMLElement | null;
  const availW = window.innerWidth - 64 - sidebarW;
  const availH = window.innerHeight - (header?.offsetHeight ?? 0) - (footer?.offsetHeight ?? 0) - sidebarH - 80;
  const scale = Math.max(0.5, Math.min(availW / CANVAS_WIDTH, availH / CANVAS_HEIGHT, 3));
  canvas.style.width = Math.floor(CANVAS_WIDTH * scale) + 'px';
}
window.addEventListener('resize', scaleCanvas);

initInput();

// ─── Mute button ───
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement;
function syncMuteBtn(): void {
  const muted = isMuted();
  muteBtn.textContent = muted ? '[ SOUND: OFF ]' : '[ SOUND: ON  ]';
  muteBtn.classList.toggle('muted', muted);
}
syncMuteBtn();
muteBtn.addEventListener('click', () => { initSound(); toggleMute(); syncMuteBtn(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { toggleMute(); syncMuteBtn(); }
  if (e.code === 'KeyZ') toggleZoom();
});

// ─── Fullscreen button ───
const fsBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
function syncFsBtn(): void {
  const active = !!document.fullscreenElement;
  fsBtn.textContent = active ? '[ FULLSCREEN: ON  ]' : '[ FULLSCREEN: OFF ]';
  fsBtn.classList.toggle('active', active);
}
syncFsBtn();
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
});
document.addEventListener('fullscreenchange', syncFsBtn);

// ─── Game state ───
const Phase = { Menu: 0, Playing: 1, LevelWon: 2, GameOver: 3, HiScores: 4, Presenting: 5, NameEntry: 6, ZoomIn: 7, Countdown: 8 } as const;
type Phase = (typeof Phase)[keyof typeof Phase];

let phase: Phase = Phase.Menu;
let menuCursor = 1; // default Normal
let difficulty = 1;
let isDemo = false;
let menuIdleFrames = 0;
const DEMO_IDLE_FRAMES = FPS * 8; // 8 s of menu inactivity starts demo
let level = 1;
let score = 0;

// Per-level state (assigned in startLevel)
let maze: MazeData;
let player: PlayerState;
let gems: GemsState;
let enemyCtx: EnemiesContext;
let timerSec: number;
let timerFrac: number;
let frameCount: number;
let prevPx: number;
let prevPy: number;
let prevEnemyPx: number[];
let prevEnemyPy: number[];
let shotPath: Array<{ gx: number; gy: number }> | null;
let shotTimer: number;
let firePrev: boolean;
let demoFireRequest = false;

// Overlay pause (frames to show win/lose message before returning to menu or next level)
let overlayTimer = 0;
let overlayKeyWait = false;
let hiScoreRank = -1;
let hiScoreKeyWait = false;

// Name entry state
let playerName = '';
let nameEntryCurrent = '';
let nameEntryTick = 0;
let pendingScore = 0;
let pendingLevel = 0;

// Level presentation state – zooming attribute rectangle (ZX Spectrum style)
type PresentRect = { left: number; top: number; right: number; bottom: number };
type PresentItem = { label: string; gx: number; gy: number; color: string };

const PRESENT_HOLD_FRAMES = 20;  // frames to flash at target (~0.4 s)
// ZX Spectrum bright attribute colours cycle around the border
const PRESENT_COLORS = ['#FF0000', '#FFFF00', '#00FFFF', '#FFFFFF', '#FF00FF', '#00FF00'] as const;

let presentItems: PresentItem[] = [];
let presentIdx = 0;
let presentRect: PresentRect = { left: 0, top: 0, right: 0, bottom: 0 };
let presentTarget: PresentRect = { left: 0, top: 0, right: 0, bottom: 0 };
let presentZoomed = false;
let presentTimer = 0;   // frame counter; reset to 0 on each sub-phase entry
let presentKeyWait = false;

// ─── Zoom mode helpers ───

function buildZoomedMaze(): void {
  setZoomRender(2, 0, HUD_HEIGHT);
  drawMaze(zoomedMazeCtx, maze);
  resetZoomRender();
}

/** Update camera to smoothly track player position in zoomed pixel coords. */
function updateCamera(): void {
  const cellSz = CELL_SIZE * 2;
  const mazeW = ECOLS * cellSz;
  const mazeH = EROWS * cellSz;
  const viewW = CANVAS_WIDTH;
  const viewH = CANVAS_HEIGHT - HUD_HEIGHT;

  let targetX = player.px * 2 + cellSz / 2 - viewW / 2;
  let targetY = player.py * 2 + cellSz / 2 - viewH / 2;
  targetX = Math.max(0, Math.min(mazeW - viewW, targetX));
  targetY = Math.max(0, Math.min(mazeH - viewH, targetY));

  cameraX += (targetX - cameraX) * 0.2;
  cameraY += (targetY - cameraY) * 0.2;
  cameraX = Math.max(0, Math.min(mazeW - viewW, cameraX));
  cameraY = Math.max(0, Math.min(mazeH - viewH, cameraY));
}

function snapCamera(): void {
  const cellSz = CELL_SIZE * 2;
  const mazeW = ECOLS * cellSz;
  const mazeH = EROWS * cellSz;
  const viewW = CANVAS_WIDTH;
  const viewH = CANVAS_HEIGHT - HUD_HEIGHT;
  cameraX = Math.max(0, Math.min(mazeW - viewW, player.px * 2 + cellSz / 2 - viewW / 2));
  cameraY = Math.max(0, Math.min(mazeH - viewH, player.py * 2 + cellSz / 2 - viewH / 2));
}

/** Render the zoomed view: blit pre-rendered maze background + draw sprites at 2x. */
function renderZoomedFrame(): void {
  updateCamera();
  const camRX = Math.round(cameraX);
  const camRY = Math.round(cameraY);

  setZoomRender(2, camRX, camRY);

  ctx2d.drawImage(
    zoomedMazeCanvas,
    camRX, camRY, CANVAS_WIDTH, CANVAS_HEIGHT - HUD_HEIGHT,
    0, HUD_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT - HUD_HEIGHT,
  );
  drawItems(ctx2d, gems);
  if (shotPath && shotTimer > 0) drawShotLine(ctx2d, shotPath);
  for (let i = 0; i < enemyCtx.enemies.length; i++) {
    drawEnemy(ctx2d, enemyCtx.enemies[i], i, frameCount, maze, true);
  }
  drawPlayer(ctx2d, player, maze, true);

  resetZoomRender();
}

function toggleZoom(): void {
  if (phase !== Phase.Playing) return;
  zoomMode = !zoomMode;
  if (zoomMode) {
    snapCamera();
    renderZoomedFrame();
  } else {
    // Full redraw in normal mode
    drawMaze(ctx2d, maze);
    drawItems(ctx2d, gems);
    for (let i = 0; i < enemyCtx.enemies.length; i++) {
      drawEnemy(ctx2d, enemyCtx.enemies[i], i, frameCount, maze);
    }
    drawPlayer(ctx2d, player, maze);
  }
  const gemsToGo = Math.max(0, gems.gemsNeeded - gems.gemsCollected);
  drawHud(ctx2d, score, level, gemsToGo, timerSec, gems.hasGun, timerSec <= 10, isDemo);
}

/** Capture current normal-scale maze and start zoom-in animation. */
function startZoomTransition(): void {
  // Snapshot the normal-scale maze area from the display canvas
  zoomTransCtx.drawImage(canvas, 0, HUD_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT - HUD_HEIGHT,
    0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - HUD_HEIGHT);
  zoomTransFrame = 0;
  zoomMode = false; // still normal during transition
  phase = Phase.ZoomIn;
}

function tickZoomIn(): void {
  zoomTransFrame++;
  const t = Math.min(1, zoomTransFrame / ZOOM_IN_FRAMES);
  // Ease-out curve
  const eased = 1 - (1 - t) * (1 - t);
  const zoom = 1 + eased; // 1 → 2

  // Zoom toward the player's position (in normal-scale source pixels)
  const cx = player.px + CELL_SIZE / 2;
  const cy = player.py + CELL_SIZE / 2;
  const srcW = CANVAS_WIDTH / zoom;
  const srcH = (CANVAS_HEIGHT - HUD_HEIGHT) / zoom;
  const maxSrcX = CANVAS_WIDTH - srcW;
  const maxSrcY = CANVAS_HEIGHT - HUD_HEIGHT - srcH;
  const srcX = Math.max(0, Math.min(maxSrcX, cx - srcW / 2));
  const srcY = Math.max(0, Math.min(maxSrcY, cy - srcH / 2));

  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, HUD_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT - HUD_HEIGHT);
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.drawImage(zoomTransCanvas, srcX, srcY, srcW, srcH,
    0, HUD_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT - HUD_HEIGHT);

  if (t >= 1) {
    zoomMode = true;
    snapCamera();
    renderZoomedFrame();
    const gemsToGo = Math.max(0, gems.gemsNeeded - gems.gemsCollected);
    drawHud(ctx2d, score, level, gemsToGo, timerSec, gems.hasGun, false, isDemo);
    phase = Phase.Playing;
  }
}

function tickCountdown(): void {
  countdownFrame++;

  // Determine which word we're on
  let elapsed = 0;
  let wordIdx = 0;
  for (let i = 0; i < COUNTDOWN_WORDS.length; i++) {
    if (countdownFrame <= elapsed + COUNTDOWN_WORDS[i].frames) {
      wordIdx = i;
      break;
    }
    elapsed += COUNTDOWN_WORDS[i].frames;
    if (i === COUNTDOWN_WORDS.length - 1) {
      // All words done → zoom in
      startZoomTransition();
      return;
    }
  }

  const localFrame = countdownFrame - elapsed;
  const word = COUNTDOWN_WORDS[wordIdx];
  const wordT = localFrame / word.frames;
  const pop = 1 + 1.2 * Math.pow(1 - wordT, 3);

  const cx = CANVAS_WIDTH / 2;
  const cy = HUD_HEIGHT + (CANVAS_HEIGHT - HUD_HEIGHT) / 2;

  // Restore maze snapshot (single drawImage, no per-tile redraw)
  ctx2d.drawImage(countdownBgCanvas, 0, 0);

  // Scale pre-rendered text via drawImage for smooth animation
  const textImg = countdownTextImgs[wordIdx];
  const alpha = wordT < 0.7 ? 1 : 1 - (wordT - 0.7) / 0.3;
  const dw = textImg.width * pop;
  const dh = textImg.height * pop;
  ctx2d.globalAlpha = alpha;
  ctx2d.drawImage(textImg, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx2d.globalAlpha = 1;
}

function startLevel(): void {
  const diff = DIFFICULTIES[difficulty];

  // Level progression: enemies, speed, chase scale with level
  const numEnemies = Math.min(4, diff.enemies + Math.floor((level - 1) / 10));
  const enemyFrames = Math.max(2, diff.enemyFrames - Math.floor((level - 1) / 2));
  const chasePct = Math.min(100, diff.chasePct + (level - 1) * 5);
  const timeLimit = Math.max(15, diff.timeLimit - (level - 1) * 3);

  maze = generateMaze(diff.extraWallPct, diff.extraHallsBase, diff.extraHallsRng);
  buildZoomedMaze();
  player = createPlayer(1, 1, CELL_SIZE);
  gems = initGems(player.gx, player.gy);
  enemyCtx = createEnemies(
    numEnemies, player.gx, player.gy,
    gems.exitGx, gems.exitGy,
    enemyFrames, chasePct, CELL_SIZE,
    maze.wallmap,
  );

  timerSec = timeLimit;
  timerFrac = 0;
  frameCount = 0;
  shotPath = null;
  shotTimer = 0;
  firePrev = false;

  prevPx = player.px;
  prevPy = player.py;
  prevEnemyPx = enemyCtx.enemies.map(e => e.px);
  prevEnemyPy = enemyCtx.enemies.map(e => e.py);

  if (isDemo) {
    // Demo: start zoomed immediately
    zoomMode = true;
    snapCamera();
    renderZoomedFrame();
    drawHud(ctx2d, score, level, gems.gemsLeft - gems.gemsCollected, timerSec, gems.hasGun, false, isDemo);
    phase = Phase.Playing;
  } else {
    // Normal: draw at 1x for presentation, then zoom-in transition after
    zoomMode = false;
    drawMaze(ctx2d, maze);
    drawItems(ctx2d, gems);
    for (let i = 0; i < enemyCtx.enemies.length; i++) {
      drawEnemy(ctx2d, enemyCtx.enemies[i], i, 0, maze);
    }
    drawPlayer(ctx2d, player, maze);
    drawHud(ctx2d, score, level, gems.gemsLeft - gems.gemsCollected, timerSec, gems.hasGun, false, isDemo);
    startPresentation();
  }
}

// ─── Presentation helpers ───

function makeTarget(gx: number, gy: number): PresentRect {
  return {
    left:   Math.max(0, gx - 1),
    top:    Math.max(0, gy - 1),
    right:  Math.min(ECOLS - 1, gx + 1),
    bottom: Math.min(EROWS - 1, gy + 1),
  };
}

/** Re-draw border cells with ZX Spectrum attribute colouring (tile visible, recoloured). */
function drawRectBorder(rect: PresentRect, color: string): void {
  const { left, top, right, bottom } = rect;
  function attrCell(gx: number, gy: number): void {
    drawCellAttr(ctx2d, gx, gy, !!maze.wallmap[gy * ECOLS + gx], color);
    drawSpritesAtCellAttr(ctx2d, gx, gy, gems, enemyCtx.enemies, player, color);
  }
  for (let gx = left; gx <= right; gx++) {
    attrCell(gx, top);
    if (bottom !== top) attrCell(gx, bottom);
  }
  for (let gy = top + 1; gy < bottom; gy++) {
    attrCell(left, gy);
    if (right !== left) attrCell(right, gy);
  }
}

/** Restore (un-paint) the border cells by redrawing tiles + sprites. */
function eraseRectBorder(rect: PresentRect): void {
  const { left, top, right, bottom } = rect;
  function restoreCell(gx: number, gy: number): void {
    const px = gx * CELL_SIZE;
    const py = gy * CELL_SIZE;
    eraseTiles(ctx2d, px, py, maze);
    redrawItemsNear(ctx2d, px, py, gems);
    for (let i = 0; i < enemyCtx.enemies.length; i++) {
      const e = enemyCtx.enemies[i];
      if (e.gx === gx && e.gy === gy) drawEnemy(ctx2d, e, i, 0, maze);
    }
    if (player.gx === gx && player.gy === gy) drawPlayer(ctx2d, player, maze);
  }
  for (let gx = left; gx <= right; gx++) {
    restoreCell(gx, top);
    if (bottom !== top) restoreCell(gx, bottom);
  }
  for (let gy = top + 1; gy < bottom; gy++) {
    restoreCell(left, gy);
    if (right !== left) restoreCell(right, gy);
  }
}

function shrinkRect(rect: PresentRect, target: PresentRect): PresentRect {
  return {
    left:   rect.left   < target.left   ? rect.left   + 1 : target.left,
    top:    rect.top    < target.top    ? rect.top    + 1 : target.top,
    right:  rect.right  > target.right  ? rect.right  - 1 : target.right,
    bottom: rect.bottom > target.bottom ? rect.bottom - 1 : target.bottom,
  };
}

function rectAtTarget(): boolean {
  return presentRect.left === presentTarget.left &&
         presentRect.top  === presentTarget.top  &&
         presentRect.right  === presentTarget.right &&
         presentRect.bottom === presentTarget.bottom;
}

// ─── Presentation lifecycle ───

function presentZoomColor(): string {
  // Color changes every 2 frames — smooth but still visibly cycling
  return PRESENT_COLORS[(presentTimer >> 1) % PRESENT_COLORS.length];
}

function beginPresentItem(): void {
  presentRect = { left: 0, top: 0, right: ECOLS - 1, bottom: EROWS - 1 };
  presentTarget = makeTarget(presentItems[presentIdx].gx, presentItems[presentIdx].gy);
  presentZoomed = false;
  presentTimer = 0;
  drawRectBorder(presentRect, presentZoomColor());
  drawPresentHud(ctx2d, score, level, presentItems[presentIdx].label, presentItems[presentIdx].color);
}

function startPresentation(): void {
  presentItems = [
    { label: 'YOU', gx: player.gx, gy: player.gy, color: COLOR.PLAYER },
  ];
  for (let i = 0; i < enemyCtx.enemies.length; i++) {
    presentItems.push({
      label: 'GHOST',
      gx: enemyCtx.enemies[i].gx,
      gy: enemyCtx.enemies[i].gy,
      color: COLOR.ENEMY[i % COLOR.ENEMY.length],
    });
  }
  if (gems.gunPlaced) {
    presentItems.push({ label: 'GUN', gx: gems.gunGx, gy: gems.gunGy, color: COLOR.GUN });
  }
  presentItems.push({ label: 'EXIT', gx: gems.exitGx, gy: gems.exitGy, color: COLOR.EXIT_LOCKED });
  presentIdx = 0;
  presentKeyWait = true;
  beginPresentItem();
  phase = Phase.Presenting;
}

function endPresentation(): void {
  eraseRectBorder(presentRect);
  const gemsToGo = Math.max(0, gems.gemsNeeded - gems.gemsCollected);
  drawHud(ctx2d, score, level, gemsToGo, timerSec, gems.hasGun, false, isDemo);

  // Draw full maze scene once
  drawMaze(ctx2d, maze);
  drawItems(ctx2d, gems);
  for (let i = 0; i < enemyCtx.enemies.length; i++) {
    drawEnemy(ctx2d, enemyCtx.enemies[i], i, 0, maze);
  }
  drawPlayer(ctx2d, player, maze);

  // Capture as snapshot for countdown frames
  const bgCtx = countdownBgCanvas.getContext('2d')!;
  bgCtx.drawImage(canvas, 0, 0);

  // Pre-render each word's text to its own canvas
  countdownTextImgs.length = 0;
  for (const w of COUNTDOWN_WORDS) {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 80;
    const tc = c.getContext('2d')!;
    tc.font = `bold 48px 'Press Start 2P', monospace`;
    tc.textAlign = 'center';
    tc.textBaseline = 'middle';
    tc.lineWidth = 6;
    tc.strokeStyle = '#000000';
    tc.strokeText(w.text, 200, 40);
    tc.fillStyle = w.color;
    tc.fillText(w.text, 200, 40);
    countdownTextImgs.push(c);
  }

  countdownFrame = 0;
  zoomMode = false;
  phase = Phase.Countdown;
}

function tickPresenting(): void {
  if (presentKeyWait) {
    if (_pressedKeys.size === 0) presentKeyWait = false;
    return;
  }
  if (_pressedKeys.size > 0) {
    endPresentation();
    return;
  }

  presentTimer++;

  if (!presentZoomed) {
    // Zoom in: 2 cells per frame, colour changes every 2 frames
    eraseRectBorder(presentRect);
    presentRect = shrinkRect(presentRect, presentTarget);
    if (!rectAtTarget()) presentRect = shrinkRect(presentRect, presentTarget);
    drawRectBorder(presentRect, presentZoomColor());
    if (rectAtTarget()) { presentZoomed = true; presentTimer = 0; sndThump(); }
  } else {
    // Hold: flash in the item's own colour, 4-frame blink period
    eraseRectBorder(presentRect);
    if (presentTimer & 4) {
      drawRectBorder(presentRect, presentItems[presentIdx].color);
    }
    if (presentTimer >= PRESENT_HOLD_FRAMES) {
      eraseRectBorder(presentRect);
      presentIdx++;
      if (presentIdx >= presentItems.length) {
        endPresentation();
      } else {
        beginPresentItem();
      }
    }
  }
}

function startDemo(): void {
  isDemo = true;
  difficulty = menuCursor;
  level = 1;
  score = 0;
  initSound();
  startLevel();
}

/** Demo AI: delegates to A*-based utility AI in ai.ts */
function getDemoDirection(): Direction | -1 {
  const result = getAIDirection(player, enemyCtx.enemies, gems, maze.wallmap, timerSec);
  demoFireRequest = result.fireRequested;
  return result.direction;
}

// ─── Input helpers for menu ───
let prevUp = false;
let prevDown = false;
let prevEnter = false;

import { _pressedKeys } from './input.ts';

// ─── Fixed timestep loop ───
const frameDuration = 1000 / FPS;
let lastTime = 0;
let accumulator = 0;
const SHOT_DISPLAY_FRAMES = 6;

function gameLoop(timestamp: number): void {
  if (lastTime === 0) lastTime = timestamp;
  accumulator += timestamp - lastTime;
  lastTime = timestamp;
  if (accumulator > frameDuration * 5) accumulator = frameDuration * 5;

  while (accumulator >= frameDuration) {
    accumulator -= frameDuration;
    tick();
  }

  requestAnimationFrame(gameLoop);
}

function tick(): void {
  if (phase === Phase.Menu) {
    tickMenu();
  } else if (phase === Phase.Presenting) {
    tickPresenting();
  } else if (phase === Phase.Playing) {
    tickPlaying();
  } else if (phase === Phase.LevelWon || phase === Phase.GameOver) {
    if (overlayKeyWait) {
      if (_pressedKeys.size === 0) overlayKeyWait = false;
    } else if (_pressedKeys.size > 0) {
      overlayTimer = 0;
    }
    overlayTimer--;
    if (overlayTimer <= 0) {
      if (isDemo) {
        startDemo();
      } else if (phase === Phase.LevelWon) {
        level++;
        startLevel();
      } else {
        // Game over → check if score qualifies; ask for name if needed
        const qualifies = score > 0 && getHiScores().some(e => score > e.score);
        if (qualifies && !playerName) {
          // First time: ask for name
          pendingScore = score;
          pendingLevel = level;
          nameEntryCurrent = '';
          nameEntryTick = 0;
          startTextInput();
          // Show a temporary hi-score rank to display on name entry screen
          hiScoreRank = getHiScores().findIndex(e => score > e.score);
          drawNameEntry(ctx2d, hiScoreRank, score, nameEntryCurrent, nameEntryTick);
          phase = Phase.NameEntry;
        } else {
          hiScoreRank = updateHiScores(score, level, playerName);
          drawHighScores(ctx2d, getHiScores(), hiScoreRank);
          hiScoreKeyWait = true;
          phase = Phase.HiScores;
        }
      }
    }
  } else if (phase === Phase.ZoomIn) {
    tickZoomIn();
  } else if (phase === Phase.Countdown) {
    tickCountdown();
  } else if (phase === Phase.HiScores) {
    tickHiScores();
  } else if (phase === Phase.NameEntry) {
    tickNameEntry();
  }
}

function tickMenu(): void {
  const upNow = _pressedKeys.has('ArrowUp');
  const downNow = _pressedKeys.has('ArrowDown');
  const enterNow = _pressedKeys.has('Enter');

  if (upNow && !prevUp && menuCursor > 0) {
    menuCursor--;
    menuIdleFrames = 0;
    drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
  }
  if (downNow && !prevDown && menuCursor < DIFFICULTIES.length - 1) {
    menuCursor++;
    menuIdleFrames = 0;
    drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
  }
  if (enterNow && !prevEnter) {
    initSound();
    difficulty = menuCursor;
    level = 1;
    score = 0;
    isDemo = false;
    menuIdleFrames = 0;
    startLevel();
  }

  prevUp = upNow;
  prevDown = downNow;
  prevEnter = enterNow;

  // Start demo after idle
  if (_pressedKeys.size === 0) {
    menuIdleFrames++;
    if (menuIdleFrames >= DEMO_IDLE_FRAMES) {
      menuIdleFrames = 0;
      startDemo();
    }
  } else {
    menuIdleFrames = 0;
  }
}

function tickPlaying(): void {
  frameCount++;

  // Cancel demo on any key press
  if (isDemo && _pressedKeys.size > 0) {
    isDemo = false;
    menuIdleFrames = 0;
    phase = Phase.Menu;
    drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
    return;
  }

  // Timer countdown
  timerFrac++;
  if (timerFrac >= FPS) {
    timerFrac = 0;
    timerSec--;
    if (timerSec <= 0) {
      sndTimeUp();
      if (zoomMode) renderZoomedFrame();
      phase = Phase.GameOver;
      overlayTimer = FPS * 3;
      overlayKeyWait = true;
      drawOverlay(ctx2d, [
        { text: 'TIME UP!', color: '#FF0000', size: 48 },
        { text: `Score: ${score}`, color: '#FFFFFF', size: 24 },
      ]);
      return;
    }
  }

  // Shot display timer
  if (shotPath && shotTimer > 0) {
    shotTimer--;
    if (shotTimer === 0) {
      if (!zoomMode) {
        eraseShotLine(ctx2d, shotPath, maze);
        for (const { gx, gy } of shotPath) {
          redrawItemsNear(ctx2d, gx * CELL_SIZE, gy * CELL_SIZE, gems);
        }
      }
      shotPath = null;
    }
  }

  // Player movement
  const dir = isDemo ? getDemoDirection() : getDirection();
  const arrivedAtCell = updatePlayer(player, dir, maze, CELL_SIZE);

  if (arrivedAtCell) {
    sndStep(player.walk);
    const wasExitOpen = gems.exitOpen;
    if (tryCollectGem(gems, player.gx, player.gy)) {
      score += 10;
      sndGem();
      if (gems.exitOpen && !wasExitOpen) sndExitOpen();
      if (!zoomMode) drawItems(ctx2d, gems);
    }
    if (tryCollectGun(gems, player.gx, player.gy)) {
      sndGunPickup();
      if (!zoomMode) drawItems(ctx2d, gems);
    }
    if (gems.exitOpen && player.gx === gems.exitGx && player.gy === gems.exitGy) {
      score += timerSec * 5;
      sndWin();
      if (zoomMode) renderZoomedFrame();
      phase = Phase.LevelWon;
      overlayTimer = FPS * 2;
      overlayKeyWait = true;
      drawOverlay(ctx2d, [
        { text: 'LEVEL COMPLETE!', color: '#00FF00', size: 48 },
        { text: `Gems: ${gems.gemsCollected}/${gems.totalGems}  Time bonus: ${timerSec * 5}`, color: '#FFFFFF', size: 20 },
        { text: `Score: ${score}`, color: '#FFFF00', size: 24 },
      ]);
      return;
    }
  }

  // Fire gun
  const fireNow = isDemo ? demoFireRequest : isFirePressed();
  if (fireNow && !firePrev && gems.hasGun && !shotPath) {
    gems.hasGun = false;
    sndShot();
    const result = fireGun(player.gx, player.gy, player.dir, enemyCtx, maze.wallmap);
    if (result.path.length > 0) {
      shotPath = result.path;
      shotTimer = SHOT_DISPLAY_FRAMES;
      if (!zoomMode) drawShotLine(ctx2d, shotPath);
      if (result.hitEnemy !== -1) sndShotHit();
    }
  }
  firePrev = fireNow;

  // Update enemies
  const collision = updateEnemies(enemyCtx, player.gx, player.gy, player.px, player.py, maze, gems, CELL_SIZE);
  if (collision) {
    sndCaught();
    if (zoomMode) renderZoomedFrame();
    phase = Phase.GameOver;
    overlayTimer = FPS * 3;
    overlayKeyWait = true;
    drawOverlay(ctx2d, [
      { text: 'CAUGHT!', color: '#FF0000', size: 48 },
      { text: `Score: ${score}`, color: '#FFFFFF', size: 24 },
    ]);
    return;
  }

  // ─── Draw ───

  if (zoomMode) {
    renderZoomedFrame();
  } else {
    // Erase old player position
    if (player.px !== prevPx || player.py !== prevPy) {
      eraseTiles(ctx2d, prevPx, prevPy, maze);
      redrawItemsNear(ctx2d, prevPx, prevPy, gems);
    }

    // Erase old enemy positions
    for (let i = 0; i < enemyCtx.enemies.length; i++) {
      const e = enemyCtx.enemies[i];
      if (e.px !== prevEnemyPx[i] || e.py !== prevEnemyPy[i]) {
        eraseTiles(ctx2d, prevEnemyPx[i], prevEnemyPy[i], maze);
        redrawItemsNear(ctx2d, prevEnemyPx[i], prevEnemyPy[i], gems);
      }
    }

    // Draw enemies
    for (let i = 0; i < enemyCtx.enemies.length; i++) {
      drawEnemy(ctx2d, enemyCtx.enemies[i], i, frameCount, maze);
    }

    // Draw player on top
    drawPlayer(ctx2d, player, maze);
  }

  prevPx = player.px;
  prevPy = player.py;
  for (let i = 0; i < enemyCtx.enemies.length; i++) {
    prevEnemyPx[i] = enemyCtx.enemies[i].px;
    prevEnemyPy[i] = enemyCtx.enemies[i].py;
  }

  // Update HUD
  const gemsToGo = Math.max(0, gems.gemsNeeded - gems.gemsCollected);
  drawHud(ctx2d, score, level, gemsToGo, timerSec, gems.hasGun, timerSec <= 10, isDemo);
}

function tickHiScores(): void {
  // Wait for all keys to be released first, then any key press returns to menu
  if (hiScoreKeyWait) {
    if (_pressedKeys.size === 0) hiScoreKeyWait = false;
    return;
  }
  if (_pressedKeys.size > 0) {
    phase = Phase.Menu;
    drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
  }
}

const MAX_NAME_LENGTH = 10;

function tickNameEntry(): void {
  nameEntryTick++;
  for (const ch of drainTextInput()) {
    if (ch === '\n') {
      // Confirm name
      stopTextInput();
      const name = nameEntryCurrent.trim() || 'PLAYER';
      playerName = name;
      savePlayerName(name);
      hiScoreRank = updateHiScores(pendingScore, pendingLevel, name);
      drawHighScores(ctx2d, getHiScores(), hiScoreRank);
      hiScoreKeyWait = true;
      phase = Phase.HiScores;
      return;
    } else if (ch === '\b') {
      nameEntryCurrent = nameEntryCurrent.slice(0, -1);
    } else if (nameEntryCurrent.length < MAX_NAME_LENGTH) {
      nameEntryCurrent += ch;
    }
  }
  drawNameEntry(ctx2d, hiScoreRank, pendingScore, nameEntryCurrent, nameEntryTick);
}

// ─── Start ───
loadHiScores();
playerName = loadPlayerName();
document.fonts.ready.then(() => {
  scaleCanvas();
  drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
  requestAnimationFrame(gameLoop);
});

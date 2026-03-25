import './style.css';
import { CANVAS_WIDTH, CANVAS_HEIGHT, CELL_SIZE, FPS, DIFFICULTIES } from './constants.ts';
import { generateMaze } from './maze.ts';
import {
  drawMaze, drawPlayer, drawItems, drawEnemy, drawShotLine, eraseShotLine,
  eraseTiles, redrawItemsNear, drawHud, drawOverlay, drawMenu, drawHighScores,
} from './renderer.ts';
import { initInput, getDirection, isFirePressed } from './input.ts';
import { createPlayer, updatePlayer } from './player.ts';
import { initGems, tryCollectGem, tryCollectGun } from './gems.ts';
import type { GemsState } from './gems.ts';
import { createEnemies, updateEnemies, fireGun } from './enemy.ts';
import type { EnemiesContext } from './enemy.ts';
import type { MazeData } from './types.ts';
import type { PlayerState } from './player.ts';
import { initSound, sndGem, sndGunPickup, sndShot, sndShotHit, sndExitOpen, sndCaught, sndWin, sndTimeUp } from './sound.ts';
import { loadHiScores, getHiScores, updateHiScores } from './hiscore.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const ctx2d = canvas.getContext('2d')!;
ctx2d.imageSmoothingEnabled = false;

initInput();

// ─── Game state ───
const Phase = { Menu: 0, Playing: 1, LevelWon: 2, GameOver: 3, HiScores: 4 } as const;
type Phase = (typeof Phase)[keyof typeof Phase];

let phase: Phase = Phase.Menu;
let menuCursor = 1; // default Normal
let difficulty = 1;
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

// Overlay pause (frames to show win/lose message before returning to menu or next level)
let overlayTimer = 0;
let hiScoreRank = -1;
let hiScoreKeyWait = false;

function startLevel(): void {
  const diff = DIFFICULTIES[difficulty];

  // Level progression: enemies, speed, chase scale with level
  const numEnemies = Math.min(4, diff.enemies + Math.floor((level - 1) / 10));
  const enemyFrames = Math.max(2, diff.enemyFrames - Math.floor((level - 1) / 2));
  const chasePct = Math.min(100, diff.chasePct + (level - 1) * 5);
  const timeLimit = Math.max(15, diff.timeLimit - (level - 1) * 3);

  maze = generateMaze(diff.extraWallPct, diff.extraHallsBase, diff.extraHallsRng);
  player = createPlayer(1, 1, CELL_SIZE);
  gems = initGems(player.gx, player.gy);
  enemyCtx = createEnemies(
    numEnemies, player.gx, player.gy,
    gems.exitGx, gems.exitGy,
    enemyFrames, chasePct, CELL_SIZE,
  );

  timerSec = timeLimit;
  timerFrac = 0;
  frameCount = 0;
  shotPath = null;
  shotTimer = 0;
  firePrev = false;

  // Draw everything
  drawMaze(ctx2d, maze);
  drawItems(ctx2d, gems);
  for (let i = 0; i < enemyCtx.enemies.length; i++) {
    drawEnemy(ctx2d, enemyCtx.enemies[i], i, 0, maze);
  }
  drawPlayer(ctx2d, player, maze);
  drawHud(ctx2d, score, level, gems.gemsLeft - gems.gemsCollected, timerSec, gems.hasGun, false);

  prevPx = player.px;
  prevPy = player.py;
  prevEnemyPx = enemyCtx.enemies.map(e => e.px);
  prevEnemyPy = enemyCtx.enemies.map(e => e.py);

  phase = Phase.Playing;
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
  } else if (phase === Phase.Playing) {
    tickPlaying();
  } else if (phase === Phase.LevelWon || phase === Phase.GameOver) {
    overlayTimer--;
    if (overlayTimer <= 0) {
      if (phase === Phase.LevelWon) {
        level++;
        startLevel();
      } else {
        // Game over → show high scores
        hiScoreRank = updateHiScores(score, level);
        drawHighScores(ctx2d, getHiScores(), hiScoreRank);
        hiScoreKeyWait = true;
        phase = Phase.HiScores;
      }
    }
  } else if (phase === Phase.HiScores) {
    tickHiScores();
  }
}

function tickMenu(): void {
  const upNow = _pressedKeys.has('ArrowUp');
  const downNow = _pressedKeys.has('ArrowDown');
  const enterNow = _pressedKeys.has('Enter');

  if (upNow && !prevUp && menuCursor > 0) {
    menuCursor--;
    drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
  }
  if (downNow && !prevDown && menuCursor < DIFFICULTIES.length - 1) {
    menuCursor++;
    drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
  }
  if (enterNow && !prevEnter) {
    initSound();
    difficulty = menuCursor;
    level = 1;
    score = 0;
    startLevel();
  }

  prevUp = upNow;
  prevDown = downNow;
  prevEnter = enterNow;
}

function tickPlaying(): void {
  frameCount++;

  // Timer countdown
  timerFrac++;
  if (timerFrac >= FPS) {
    timerFrac = 0;
    timerSec--;
    if (timerSec <= 0) {
      sndTimeUp();
      phase = Phase.GameOver;
      overlayTimer = FPS * 3;
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
      eraseShotLine(ctx2d, shotPath, maze);
      for (const { gx, gy } of shotPath) {
        redrawItemsNear(ctx2d, gx * CELL_SIZE, gy * CELL_SIZE, gems);
      }
      shotPath = null;
    }
  }

  // Player movement
  const dir = getDirection();
  const arrivedAtCell = updatePlayer(player, dir, maze, CELL_SIZE);

  if (arrivedAtCell) {
    const wasExitOpen = gems.exitOpen;
    if (tryCollectGem(gems, player.gx, player.gy)) {
      score += 10;
      sndGem();
      if (gems.exitOpen && !wasExitOpen) sndExitOpen();
      drawItems(ctx2d, gems);
    }
    if (tryCollectGun(gems, player.gx, player.gy)) {
      sndGunPickup();
      drawItems(ctx2d, gems);
    }
    if (gems.exitOpen && player.gx === gems.exitGx && player.gy === gems.exitGy) {
      score += timerSec * 5;
      sndWin();
      phase = Phase.LevelWon;
      overlayTimer = FPS * 2;
      drawOverlay(ctx2d, [
        { text: 'LEVEL COMPLETE!', color: '#00FF00', size: 48 },
        { text: `Gems: ${gems.gemsCollected}/${gems.totalGems}  Time bonus: ${timerSec * 5}`, color: '#FFFFFF', size: 20 },
        { text: `Score: ${score}`, color: '#FFFF00', size: 24 },
      ]);
      return;
    }
  }

  // Fire gun
  const fireNow = isFirePressed();
  if (fireNow && !firePrev && gems.hasGun && !shotPath) {
    gems.hasGun = false;
    sndShot();
    const result = fireGun(player.gx, player.gy, player.dir, enemyCtx, maze.wallmap);
    if (result.path.length > 0) {
      shotPath = result.path;
      shotTimer = SHOT_DISPLAY_FRAMES;
      drawShotLine(ctx2d, shotPath);
      if (result.hitEnemy !== -1) sndShotHit();
    }
  }
  firePrev = fireNow;

  // Update enemies
  const collision = updateEnemies(enemyCtx, player.gx, player.gy, player.px, player.py, maze, gems, CELL_SIZE);
  if (collision) {
    sndCaught();
    phase = Phase.GameOver;
    overlayTimer = FPS * 3;
    drawOverlay(ctx2d, [
      { text: 'CAUGHT!', color: '#FF0000', size: 48 },
      { text: `Score: ${score}`, color: '#FFFFFF', size: 24 },
    ]);
    return;
  }

  // ─── Draw ───

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
    prevEnemyPx[i] = enemyCtx.enemies[i].px;
    prevEnemyPy[i] = enemyCtx.enemies[i].py;
  }

  // Draw player on top
  drawPlayer(ctx2d, player, maze);
  prevPx = player.px;
  prevPy = player.py;

  // Update HUD
  const gemsToGo = Math.max(0, gems.gemsNeeded - gems.gemsCollected);
  drawHud(ctx2d, score, level, gemsToGo, timerSec, gems.hasGun, timerSec <= 10);
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

// ─── Start ───
loadHiScores();
drawMenu(ctx2d, menuCursor, DIFFICULTIES.map(d => d.name));
requestAnimationFrame(gameLoop);

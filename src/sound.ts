/**
 * Sound effects using Web Audio API square wave oscillators,
 * replicating the ZX Spectrum bit_beep style.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browsers require user gesture)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a square wave tone. Duration in seconds, frequency in Hz.
 */
function beep(freq: number, duration: number, startTime?: number): void {
  const ctx = getCtx();
  const t = startTime ?? ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export function sndStep(): void {
  beep(800, 0.02);
}

export function sndBump(): void {
  beep(200, 0.02);
}

export function sndGem(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(1200, 0.04, t);
  beep(1600, 0.04, t + 0.04);
}

export function sndGunPickup(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(1000, 0.03, t);
  beep(1400, 0.03, t + 0.03);
  beep(1800, 0.03, t + 0.06);
}

export function sndShot(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(2000, 0.03, t);
  beep(1500, 0.03, t + 0.03);
  beep(1000, 0.03, t + 0.06);
}

export function sndShotHit(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(600, 0.1, t);
  beep(900, 0.1, t + 0.1);
}

export function sndExitOpen(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(600, 0.08, t);
  beep(800, 0.08, t + 0.08);
  beep(1200, 0.12, t + 0.16);
}

export function sndCaught(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(400, 0.12, t);
  beep(300, 0.12, t + 0.12);
  beep(150, 0.25, t + 0.24);
}

export function sndWin(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(800, 0.1, t);
  beep(1000, 0.1, t + 0.1);
  beep(1400, 0.2, t + 0.2);
}

export function sndTimeUp(): void {
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(500, 0.15, t);
  beep(350, 0.15, t + 0.15);
  beep(200, 0.3, t + 0.3);
}

/** Call on first user interaction to unlock audio. */
export function initSound(): void {
  getCtx();
}

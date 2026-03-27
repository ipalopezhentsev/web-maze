/**
 * Sound effects using Web Audio API square wave oscillators,
 * replicating the ZX Spectrum bit_beep style.
 */

let soundMuted = localStorage.getItem('mazeMuted') === '1';

export function isMuted(): boolean { return soundMuted; }

export function toggleMute(): void {
  soundMuted = !soundMuted;
  localStorage.setItem('mazeMuted', soundMuted ? '1' : '0');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioContextCtor: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContextCtor();
  }
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

export function sndStep(walk: number): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  const duration = 0.025;
  const samples = Math.ceil(ctx.sampleRate * duration);

  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Highpass to cut rumble, keep crack
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = walk === 0 ? 1800 : 2200;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(t);
  source.stop(t + duration);
}

export function sndBump(): void {
  if (soundMuted) return;
  beep(200, 0.02);
}

export function sndGem(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(1200, 0.04, t);
  beep(1600, 0.04, t + 0.04);
}

export function sndGunPickup(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(1000, 0.03, t);
  beep(1400, 0.03, t + 0.03);
  beep(1800, 0.03, t + 0.06);
}

export function sndShot(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(2000, 0.03, t);
  beep(1500, 0.03, t + 0.03);
  beep(1000, 0.03, t + 0.06);
}

export function sndShotHit(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(600, 0.1, t);
  beep(900, 0.1, t + 0.1);
}

export function sndExitOpen(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(600, 0.08, t);
  beep(800, 0.08, t + 0.08);
  beep(1200, 0.12, t + 0.16);
}

export function sndCaught(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(400, 0.12, t);
  beep(300, 0.12, t + 0.12);
  beep(150, 0.25, t + 0.24);
}

export function sndWin(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(800, 0.1, t);
  beep(1000, 0.1, t + 0.1);
  beep(1400, 0.2, t + 0.2);
}

export function sndThump(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  const duration = 0.12;
  const samples = Math.ceil(ctx.sampleRate * duration);

  // Sub-bass thud: noise shaped by lowpass
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1.0, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(t);
  source.stop(t + duration);
}

export function sndTimeUp(): void {
  if (soundMuted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  beep(500, 0.15, t);
  beep(350, 0.15, t + 0.15);
  beep(200, 0.3, t + 0.3);
}

/** Call on first user interaction to unlock audio (required on iOS/Safari). */
export function initSound(): void {
  if (!audioCtx) {
    audioCtx = new AudioContextCtor();
  }
  const ctx = audioCtx;
  const unlock = () => {
    // Play a silent one-frame buffer — this is the standard iOS unlock trick
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(unlock);
  } else {
    unlock();
  }
}

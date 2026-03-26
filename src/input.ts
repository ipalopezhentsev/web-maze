import { Direction } from './types.ts';

export const _pressedKeys = new Set<string>();
const pressed = _pressedKeys;

let textActive = false;
const textQueue: string[] = [];

export function startTextInput(): void { textActive = true; textQueue.length = 0; }
export function stopTextInput(): void { textActive = false; textQueue.length = 0; }
/** Returns and clears all characters typed since the last call. */
export function drainTextInput(): string[] { return textQueue.splice(0); }

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    pressed.add(e.code);
    // Prevent arrow keys from scrolling the page
    if (e.code.startsWith('Arrow') || e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'Enter') {
      e.preventDefault();
    }
    if (textActive) {
      if (e.key === 'Backspace') textQueue.push('\b');
      else if (e.key === 'Enter') textQueue.push('\n');
      else if (e.key.length === 1) textQueue.push(e.key);
    }
  });
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.code);
  });
  // Clear all keys when window loses focus
  window.addEventListener('blur', () => pressed.clear());
}

/** Returns the currently held movement direction, or -1 if none. */
export function getDirection(): Direction | -1 {
  if (pressed.has('ArrowLeft')) return Direction.Left;
  if (pressed.has('ArrowRight')) return Direction.Right;
  if (pressed.has('ArrowUp')) return Direction.Up;
  if (pressed.has('ArrowDown')) return Direction.Down;
  return -1;
}

/** Returns true if fire (Ctrl) is pressed this frame. */
export function isFirePressed(): boolean {
  return pressed.has('ControlLeft') || pressed.has('ControlRight');
}

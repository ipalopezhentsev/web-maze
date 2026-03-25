import { Direction } from './types.ts';

export const _pressedKeys = new Set<string>();
const pressed = _pressedKeys;

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    pressed.add(e.code);
    // Prevent arrow keys from scrolling the page
    if (e.code.startsWith('Arrow') || e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'Enter') {
      e.preventDefault();
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

/**
 * 8x8 pixel bitmaps ported from the original ZX Spectrum game.
 * Each array is 8 bytes; each byte is one row, MSB = leftmost pixel.
 */

/** Brick wall pattern (red ink on yellow paper in original) */
export const BRICK: readonly number[] = [
  0b11110111,
  0b11110111,
  0b11110111,
  0b00000000,
  0b11011111,
  0b11011111,
  0b11011111,
  0b00000000,
];

/** Floor tile: sparse dot pattern */
export const FLOOR: readonly number[] = [
  0b00000000,
  0b00100010,
  0b00000000,
  0b00000000,
  0b00000000,
  0b10001000,
  0b00000000,
  0b00000000,
];

/** Gem pickup */
export const GEM: readonly number[] = [
  0b00000000,
  0b00111100,
  0b01101110,
  0b01111110,
  0b00111100,
  0b00111100,
  0b00011000,
  0b00000000,
];

/** Gun pickup */
export const GUN: readonly number[] = [
  0b00000000,
  0b00011110,
  0b00111111,
  0b01111100,
  0b01111100,
  0b00111111,
  0b00011110,
  0b00000000,
];

/** Exit gate tile */
export const EXIT: readonly number[] = [
  0b00000000,
  0b00000000,
  0b01000100,
  0b00101000,
  0b00010000,
  0b00101000,
  0b01000100,
  0b00000000,
];

/** Player sprites: front/right/left × stand/walk */
export const MAN_FRONT_STAND: readonly number[] = [0x18, 0x18, 0x3C, 0x18, 0x18, 0x18, 0x24, 0x00];
export const MAN_FRONT_WALK: readonly number[] = [0x18, 0x18, 0x3C, 0x18, 0x18, 0x24, 0x24, 0x00];
export const MAN_RIGHT_STAND: readonly number[] = [0x18, 0x18, 0x1E, 0x30, 0x18, 0x18, 0x24, 0x00];
export const MAN_RIGHT_WALK: readonly number[] = [0x18, 0x18, 0x1E, 0x30, 0x18, 0x24, 0x42, 0x00];
export const MAN_LEFT_STAND: readonly number[] = [0x18, 0x18, 0x78, 0x0C, 0x18, 0x18, 0x24, 0x00];
export const MAN_LEFT_WALK: readonly number[] = [0x18, 0x18, 0x78, 0x0C, 0x18, 0x24, 0x42, 0x00];

/** Enemy skull sprites: front/right/left × stand/walk */
export const SKULL_FRONT_STAND: readonly number[] = [
  0b00111100,
  0b01111110,
  0b11011011,
  0b11111111,
  0b10111101,
  0b01100110,
  0b00111100,
  0b00000000,
];
export const SKULL_FRONT_WALK: readonly number[] = [
  0b00111100,
  0b01111110,
  0b11011011,
  0b11111111,
  0b10111101,
  0b01111110,
  0b00111100,
  0b00000000,
];
export const SKULL_RIGHT_STAND: readonly number[] = [
  0b00111100,
  0b01111110,
  0b11101101,
  0b11111111,
  0b10111101,
  0b01100110,
  0b00111100,
  0b00000000,
];
export const SKULL_RIGHT_WALK: readonly number[] = [
  0b00111100,
  0b01111110,
  0b11101101,
  0b11111111,
  0b10111101,
  0b01111110,
  0b00111100,
  0b00000000,
];
export const SKULL_LEFT_STAND: readonly number[] = [
  0b00111100,
  0b01111110,
  0b10110111,
  0b11111111,
  0b10111101,
  0b01100110,
  0b00111100,
  0b00000000,
];
export const SKULL_LEFT_WALK: readonly number[] = [
  0b00111100,
  0b01111110,
  0b10110111,
  0b11111111,
  0b10111101,
  0b01111110,
  0b00111100,
  0b00000000,
];

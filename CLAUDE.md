# CLAUDE.md

## Project

Browser port of a ZX Spectrum maze game. HTML5 Canvas + TypeScript + Vite. No game framework.

## Build & Run

```bash
npm run dev      # dev server (http://localhost:5173)
npm run build    # tsc + vite build → docs/
```

## Architecture

- `src/main.ts` — game loop (50fps fixed timestep), state machine (Menu → Playing → LevelWon/GameOver → HiScores → Menu)
- `src/maze.ts` — recursive backtracker maze generation, expanded to 29×19 grid
- `src/renderer.ts` — all Canvas 2D drawing: tiles via `putImageData`, sprites via `fillRect`, HUD, menus, overlays
- `src/player.ts` — player movement with 4-frame animation and corner-cutting
- `src/enemy.ts` — BFS pathfinding on full 29×19 grid, round-robin enemy scheduling, stun gun mechanic
- `src/gems.ts` — gem/gun placement, collection, exit unlock logic (≥50% gems needed)
- `src/input.ts` — keyboard tracking via `Set<string>`, arrow keys + Ctrl only
- `src/sound.ts` — Web Audio square wave beeps
- `src/hiscore.ts` — top 5 scores in localStorage
- `src/sprites.ts` — 8×8 pixel bitmaps (ported from original C arrays)
- `src/constants.ts` — grid dimensions, colors, difficulty configs
- `src/types.ts` — Direction, MazeData (uses `as const` objects, not enums — `erasableSyntaxOnly` is on)

## Key Constraints

- No enums — use `as const` objects with type aliases (`erasableSyntaxOnly` in tsconfig)
- Controls: arrow keys + Ctrl for fire only. No WASD/OQPA
- Use full algorithms (BFS on 29×19 grid, not coarse 14×9). Don't replicate ZX Spectrum memory-saving shortcuts
- `putImageData` ignores canvas transforms — all drawing adds `MAZE_Y` offset manually
- Dirty-rect rendering: `eraseTiles()` → `redrawItemsNear()` → draw sprites. No full-canvas redraws

## Deploy

Vite builds to `docs/` with `base: '/web-maze/'`. GitHub Pages serves from `main` branch `/docs` folder.

# Maze Runner

A browser port of a ZX Spectrum maze game, built with HTML5 Canvas and TypeScript.

Collect gems, avoid ghosts, find the stun gun, and escape the maze before time runs out.

## Play

https://ipalopezhentsev.github.io/web-maze/

## Controls

- **Arrow keys** — move
- **Ctrl** — fire stun gun (stuns ghosts for 8 seconds)
- **Up/Down + Enter** — menu navigation

## How to Play

1. Collect enough gems (≥50%) to unlock the exit gate
2. Reach the exit before time runs out
3. Avoid ghosts — they chase you and steal gems
4. Pick up the stun gun for a one-shot defense
5. Bonus points for remaining time when you exit

## Difficulty

| Level     | Ghosts | Chase AI | Time |
|-----------|--------|----------|------|
| Easy      | 1      | 40%      | 90s  |
| Normal    | 2      | 60%      | 60s  |
| Hard      | 3      | 80%      | 45s  |
| Nightmare | 4      | 95%      | 30s  |

Difficulty increases each level: more ghosts, faster movement, smarter AI, less time.

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev      # start dev server with hot reload
npm run build    # type-check + build to docs/
```

Build output goes to `docs/` for GitHub Pages deployment (branch: `main`, folder: `/docs`).

VS Code: `Ctrl+Shift+B` runs the build task.

## Tech Stack

- TypeScript + Vite
- HTML5 Canvas 2D (no game framework)
- Web Audio API (square wave oscillators for retro sound)
- localStorage for high scores

## Origin

Ported from a ZX Spectrum game written in C. Original source: https://github.com/ipalopezhentsev/zxspectrum-games

## Bugs
- in demo: after opening exit, if time permits, try to grab as much coins as possible before going to exit to maximize score

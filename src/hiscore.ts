const STORAGE_KEY = 'maze-runner-hiscores';
const NAME_KEY = 'maze-runner-player-name';
const NUM_HISCORES = 5;

export interface HiScoreEntry {
  score: number;
  level: number;
  name: string;
}

let table: HiScoreEntry[] = [];

/** Load high scores from localStorage. */
export function loadHiScores(): void {
  table = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry.score === 'number' && typeof entry.level === 'number') {
            table.push({ score: entry.score, level: entry.level, name: typeof entry.name === 'string' ? entry.name : '' });
          }
        }
      }
    }
  } catch { /* ignore corrupt data */ }

  // Pad to NUM_HISCORES
  while (table.length < NUM_HISCORES) {
    table.push({ score: 0, level: 0, name: '' });
  }
  table.length = NUM_HISCORES;
}

/** Save current table to localStorage. */
function saveHiScores(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch { /* storage full or unavailable */ }
}

/** Get the current high score table. */
export function getHiScores(): HiScoreEntry[] {
  return table;
}

/** Load the persisted player name (empty string if never set). */
export function loadPlayerName(): string {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

/** Persist the player name. */
export function savePlayerName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name); } catch {}
}

/**
 * Insert a score into the table if it qualifies.
 * Returns the rank (0-based) or -1 if it didn't make the table.
 */
export function updateHiScores(score: number, level: number, name: string): number {
  if (score <= 0) return -1;

  for (let i = 0; i < NUM_HISCORES; i++) {
    if (score > table[i].score) {
      // Shift lower scores down
      for (let j = NUM_HISCORES - 1; j > i; j--) {
        table[j] = table[j - 1];
      }
      table[i] = { score, level, name };
      saveHiScores();
      return i;
    }
  }
  return -1;
}

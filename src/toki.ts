// The link to Toki, the game site Blocktown runs on: high scores and achievements. Outside Toki these do nothing.
import meta from "../toki.json";

interface TokiApi { score?: (points: number, board?: string) => void; achievement?: (id: string) => void }
const api = (): TokiApi | undefined => (window as unknown as { toki?: TokiApi }).toki;

export const insideToki = (() => { try { return window.parent !== window; } catch { return true; } })();

const SENT_KEY = "blocktown.sent";
let sent: Record<string, number> = {};
try { sent = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, number>; } catch { sent = {}; }
const lastTime: Record<string, number> = {};

/** Sends a score to one of the game's lists ("" is the main one). Toki keeps each player's best, so only better scores are sent, and not too often. */
export function sendScore(board: string, value: number) {
  if (!isFinite(value) || value <= 0) return;
  const lower = board === "fast10k";
  const before = sent[board];
  if (before !== undefined && (lower ? value >= before : value <= before)) return;
  const now = Date.now();
  if (now - (lastTime[board] ?? 0) < 45000) return;
  lastTime[board] = now;
  sent[board] = value;
  try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch { /* storage is full or off */ }
  const toki = api();
  if (!toki?.score) return;
  if (board) toki.score(value, board); else toki.score(value);
}

export function sendAchievement(id: string) {
  api()?.achievement?.(id);
}

/** An achievement's name and icon, for the message shown when the game runs outside Toki. */
export function achievementInfo(id: string, lang: "en" | "de"): { name: string; icon: string } {
  const a = meta.achievements.find((x) => x.id === id);
  return a ? { name: lang === "de" ? a.name_de : a.name, icon: a.icon } : { name: id, icon: "🏅" };
}

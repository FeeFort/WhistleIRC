import vm from "node:vm";
import { fetchLastMapResult } from "./matchResultFetcher.js";
import type { TeamMapResult } from "./matchResultParser.js";

export type WinConditionWinner = "red" | "blue" | "tie";

export interface WinConditionContext {
  redScore: number;
  blueScore: number;
  redCombo: number;
  blueCombo: number;
  redAccuracy: number;
  blueAccuracy: number;
  redMisses: number;
  blueMisses: number;
  players?: unknown[];
  // Present only when a live match is being scored (not from the editor's "Test" panel).
  // parseRoom() falls back to the already-known context fields when matchId is missing.
  matchId?: number;
  [key: string]: unknown;
}

export interface WinConditionOutcome {
  winner: WinConditionWinner;
  error: string | null;
  systemMessages: string[];
  // Populated only once the script calls calculateWinner(). Feeds the
  // beatmapWinner / beatmapTeamRedScore / beatmapTeamBlueScore / scoreDifference
  // result-variables that message templates read after scoring finishes.
  result: { beatmapWinner: WinConditionWinner; beatmapTeamRedScore: number; beatmapTeamBlueScore: number; scoreDifference: number } | null;
}

const SYNC_TIMEOUT_MS = 200; // guards the synchronous portion of a script, i.e. everything before its first await
const ASYNC_TIMEOUT_MS = 12000; // guards the whole run once it goes async (network calls inside parseRoom(), etc.)

function fallback(context: { redScore: number; blueScore: number }): WinConditionWinner {
  return context.redScore === context.blueScore ? "tie" : context.redScore > context.blueScore ? "red" : "blue";
}

// Strips anything that isn't plain, serializable data before it crosses into the sandbox.
// This doesn't add sandbox-escape protection (codeGeneration:{strings:false} is what does that) —
// it protects against accidentally handing the script a live object with real methods on it
// (a DB row, a socket, anything richer than data) just because it happened to be nearby in context.
function toPlainData<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

// sum/average/min/max — the reduction helpers the script needs for accuracy/combo, which
// arrive as per-player arrays instead of a pre-decided aggregate. Kept separate from the
// native Math global so `math.average(...)` and `Math.round(...)` both stay obviously distinct.
const scriptMath = Object.freeze({
  sum: (values: number[]) => (Array.isArray(values) ? values.reduce((total, value) => total + (Number(value) || 0), 0) : 0),
  average: (values: number[]) => (Array.isArray(values) && values.length ? scriptMath.sum(values) / values.length : 0),
  min: (values: number[]) => (Array.isArray(values) && values.length ? Math.min(...values.map((value) => Number(value) || 0)) : 0),
  max: (values: number[]) => (Array.isArray(values) && values.length ? Math.max(...values.map((value) => Number(value) || 0)) : 0),
});

function fallbackTeam(score: number, misses: number, accuracy: number, combo: number): TeamMapResult {
  const player = { userId: 0, username: "", team: "red" as const, score, accuracy, combo, misses, count300: 0, count100: 0, count50: 0, mods: [], passed: true, rank: "" };
  return { score, misses, count300: 0, count100: 0, count50: 0, accuracy: [accuracy], combo: [combo], players: [player], player1: player } as TeamMapResult;
}

export async function evaluateWinCondition(source: string | undefined, context: WinConditionContext): Promise<WinConditionOutcome> {
  const redScore = Number(context.redScore ?? context.redBeatmapScore) || 0;
  const blueScore = Number(context.blueScore ?? context.blueBeatmapScore) || 0;
  const defaultWinner = fallback({ redScore, blueScore });
  if (!source?.trim()) return { winner: defaultWinner, error: null, systemMessages: [], result: null };

  const systemMessages: string[] = [];
  let winner: WinConditionWinner | null = null;
  let calculated: WinConditionOutcome["result"] = null;

  function calculateWinner(scores: { red: number; blue: number }, options: { reverse?: boolean; onTie?: "throw" | "manual" } = {}): WinConditionWinner {
    const red = Number(scores?.red);
    const blue = Number(scores?.blue);
    if (!Number.isFinite(red) || !Number.isFinite(blue)) throw new Error("calculateWinner: red/blue scores must be numbers");
    let picked: WinConditionWinner;
    if (red === blue) {
      if ((options.onTie ?? "throw") === "throw") throw new Error("calculateWinner: scores are tied — pass { onTie: 'manual' } to handle ties yourself");
      picked = "tie";
    } else {
      picked = (options.reverse ? red < blue : red > blue) ? "red" : "blue";
    }
    winner = picked;
    calculated = { beatmapWinner: picked, beatmapTeamRedScore: red, beatmapTeamBlueScore: blue, scoreDifference: Math.abs(red - blue) };
    return picked;
  }

  async function parseRoom() {
    const fetched = context.matchId ? await fetchLastMapResult(context.matchId) : null;
    const teamRed = fetched?.teamRed ?? fallbackTeam(redScore, Number(context.redMisses) || 0, Number(context.redAccuracy) || 0, Number(context.redCombo) || 0);
    const teamBlue = fetched?.teamBlue ?? fallbackTeam(blueScore, Number(context.blueMisses) || 0, Number(context.blueAccuracy) || 0, Number(context.blueCombo) || 0);
    return toPlainData({ teamRed, teamBlue });
  }

  const sandbox = vm.createContext(
    Object.freeze({
      system: Object.freeze({
        sendMessage: (text: unknown) => {
          systemMessages.push(String(text));
        },
      }),
      parseRoom,
      calculateWinner,
      math: scriptMath,
      Math,
    }),
    { codeGeneration: { strings: false, wasm: false } },
  );

  try {
    const executableSource = source.replace(/(\d),(\d)/g, "$1.$2");
    const script = new vm.Script(`(async function() {\n${executableSource}\n})()`);
    const scriptPromise = script.runInContext(sandbox, { timeout: SYNC_TIMEOUT_MS }) as Promise<unknown>;
    await Promise.race([scriptPromise, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Win condition timed out")), ASYNC_TIMEOUT_MS))]);
    if (!winner) return { winner: defaultWinner, error: "Script finished without calling calculateWinner()", systemMessages, result: null };
    return { winner, error: null, systemMessages, result: calculated };
  } catch (error) {
    return { winner: defaultWinner, error: error instanceof Error ? error.message : String(error), systemMessages, result: calculated };
  }
}

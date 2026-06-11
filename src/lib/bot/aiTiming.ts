/** ~40ms pacing when “fast-forward bots” is on — enough for React to commit between AI steps. */
export const AI_FAST_PLAYBACK_MS = 40

/** Main-phase AI tick (`trySimpleAiMainPhase`) waits this long normally so board state can settle. */
export const AI_MAIN_PHASE_DELAY_NORMAL_MS = 700

export function aiPlaybackDelay(normalMs: number, fastPlayback: boolean | undefined): number {
  return fastPlayback ? AI_FAST_PLAYBACK_MS : normalMs
}

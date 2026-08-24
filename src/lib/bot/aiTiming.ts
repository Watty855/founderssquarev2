/** ~40ms pacing for Founderbot Income / dice autoplay (RollDieDialog / IncomeDialog). */
export const AI_FAST_PLAYBACK_MS = 40

/** Main-phase AI tick (`trySimpleAiMainPhase`) — local clock; not a rules constraint. */
export const AI_MAIN_PHASE_DELAY_NORMAL_MS = 150

/** Extra trySimpleAiMainPhase calls per interval while no dialog is holding the bot. */
export const AI_MAIN_PHASE_BURST_STEPS = 3

export function aiPlaybackDelay(normalMs: number, fastPlayback: boolean | undefined): number {
  return fastPlayback ? AI_FAST_PLAYBACK_MS : normalMs
}

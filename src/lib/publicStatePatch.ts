import type { Plot } from '@/lib/types'
import type { PublicGameState, PublicPlayerState } from '@/lib/onlinePublicState'

/** Full snapshot on join and every Nth rev — least interval that still recovers missed patches. */
export const PUBLIC_STATE_KEYFRAME_EVERY = 8

export type PublicGameStatePatch = {
  fromRev: number
  rev: number
  plotsChanged?: Plot[]
  playersChanged?: PublicPlayerState[]
  /** Top-level public fields that changed (not plots/players). */
  rest?: Record<string, unknown>
}

function plotKey(p: Pick<Plot, 'row' | 'col'>): string {
  return `${p.col}${p.row}`
}

export function shouldSendPublicKeyframe(rev: number, hasPrev: boolean): boolean {
  if (!hasPrev) return true
  if (rev <= 1) return true
  return rev % PUBLIC_STATE_KEYFRAME_EVERY === 0
}

export function diffPublicGameState(
  prev: PublicGameState,
  next: PublicGameState,
  fromRev: number,
  rev: number
): PublicGameStatePatch {
  const patch: PublicGameStatePatch = { fromRev, rev }

  const prevPlots = new Map(prev.plots.map((p) => [plotKey(p), p]))
  const plotsChanged: Plot[] = []
  for (const p of next.plots) {
    const before = prevPlots.get(plotKey(p))
    if (!before || JSON.stringify(before) !== JSON.stringify(p)) plotsChanged.push(p)
  }
  if (plotsChanged.length > 0) patch.plotsChanged = plotsChanged

  const prevPlayers = new Map(prev.players.map((p) => [p.id, p]))
  const playersChanged: PublicPlayerState[] = []
  for (const p of next.players) {
    const before = prevPlayers.get(p.id)
    if (!before || JSON.stringify(before) !== JSON.stringify(p)) playersChanged.push(p)
  }
  if (playersChanged.length > 0) patch.playersChanged = playersChanged

  const rest: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  keys.delete('plots')
  keys.delete('players')
  for (const key of keys) {
    const a = (prev as unknown as Record<string, unknown>)[key]
    const b = (next as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(a) !== JSON.stringify(b)) rest[key] = b
  }
  if (Object.keys(rest).length > 0) patch.rest = rest

  return patch
}

/** Prefer a keyframe when a patch would touch so many lots that JSON is not smaller. */
export function patchIsCheaperThanKeyframe(
  patch: PublicGameStatePatch,
  plotCount: number
): boolean {
  const changed = patch.plotsChanged?.length ?? 0
  if (changed > plotCount * 0.4) return false
  return true
}

export function applyPublicGameStatePatch(
  prev: PublicGameState,
  patch: PublicGameStatePatch
): PublicGameState {
  let plots = prev.plots
  if (patch.plotsChanged && patch.plotsChanged.length > 0) {
    const updates = new Map(patch.plotsChanged.map((p) => [plotKey(p), p]))
    plots = prev.plots.map((p) => updates.get(plotKey(p)) ?? p)
    for (const p of patch.plotsChanged) {
      if (!prev.plots.some((x) => plotKey(x) === plotKey(p))) plots = [...plots, p]
    }
  }

  let players = prev.players
  if (patch.playersChanged && patch.playersChanged.length > 0) {
    const updates = new Map(patch.playersChanged.map((p) => [p.id, p]))
    players = prev.players.map((p) => updates.get(p.id) ?? p)
  }

  return {
    ...prev,
    ...(patch.rest ?? {}),
    plots,
    players,
  } as PublicGameState
}

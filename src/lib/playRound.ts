import type { GameState } from '@/lib/types'

/** Increments when the table completes a full cycle (last founder → first). Solo: every end turn. */
export function nextPlayRoundNumber(current: GameState, nextPlayerIndex: number): number {
  const n = current.players.length
  const prev = current.playRoundNumber ?? 1
  if (n <= 0) return prev
  const lastIndex = n - 1
  if (nextPlayerIndex === 0 && current.currentPlayerIndex === lastIndex) {
    return prev + 1
  }
  return prev
}

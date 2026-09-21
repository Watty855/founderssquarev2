import type { GameState } from './types'

export const FREEZE_ASSETS_CARD_ID = 'freeze-assets'
export const FREEZE_ASSETS_PLAY_COST = 8
export const FREEZE_ASSETS_BANK_VALUE = 5

/** Shown when the card is played / confirmed. */
export const FREEZE_ASSETS_LEGAL_ACTION =
  "Legal action on all players freezing all income from 'Income action card', investments and tributes from Anchors."

/** True after the endgame has been declared — Final Round turns are underway. */
export function isFinalRoundIncomeLocked(state: Pick<GameState, 'endGameTriggered' | 'gameEnded'>): boolean {
  return state.endGameTriggered === true && state.gameEnded !== true
}

export function isIncomeFreezeActive(
  state: Pick<GameState, 'incomeAssetsFrozenTurnsRemaining' | 'incomeAssetsFrozenPlayerIds'>
): boolean {
  if ((state.incomeAssetsFrozenTurnsRemaining ?? 0) > 0) return true
  return (state.incomeAssetsFrozenPlayerIds ?? []).length > 0
}

export function isPlayerIncomeFrozen(
  state: Pick<GameState, 'incomeAssetsFrozenTurnsRemaining' | 'incomeAssetsFrozenPlayerIds'>,
  _playerId: number
): boolean {
  return isIncomeFreezeActive(state)
}

/** Property-income die rolls (not banking the Income card). */
export function canRollPropertyIncome(state: GameState, playerId: number): boolean {
  if (isFinalRoundIncomeLocked(state)) return false
  if (isPlayerIncomeFrozen(state, playerId)) return false
  return true
}

export function propertyIncomeRollBlockedReason(state: GameState, playerId: number): string | null {
  if (isFinalRoundIncomeLocked(state)) {
    return 'Final Round — property-income rolls are closed. You may bank this Income card for cash.'
  }
  if (isPlayerIncomeFrozen(state, playerId)) {
    return 'Freeze Assets is in effect this round — no Income card collections, investments, or Anchor tributes. You may bank this Income card for cash.'
  }
  return null
}

/** Freeze every founder, including the player who paid, for one complete round. */
export function applyFreezeAssetsForRound(allPlayerIds: number[]): {
  incomeAssetsFrozenPlayerIds: number[]
  incomeAssetsFrozenTurnsRemaining: number
} {
  const ids = [...new Set(allPlayerIds)]
  return {
    incomeAssetsFrozenPlayerIds: ids,
    incomeAssetsFrozenTurnsRemaining: Math.max(1, ids.length),
  }
}

/** Tick down one seat. Clears when the round has completed. */
export function tickIncomeFreezeOnEndTurn(
  current: Pick<GameState, 'incomeAssetsFrozenTurnsRemaining' | 'incomeAssetsFrozenPlayerIds'>
): Partial<GameState> {
  const remaining = current.incomeAssetsFrozenTurnsRemaining ?? 0
  const list = current.incomeAssetsFrozenPlayerIds
  if (remaining <= 0 && !list?.length) return {}
  const next = remaining > 0 ? remaining - 1 : 0
  if (next <= 0) {
    return {
      incomeAssetsFrozenTurnsRemaining: undefined,
      incomeAssetsFrozenPlayerIds: [],
    }
  }
  return { incomeAssetsFrozenTurnsRemaining: next }
}

/** Drop payouts to frozen founders so the owner keeps those shares. */
export function omitFrozenRecipientAmounts(
  amounts: Record<number, number>,
  state: Pick<GameState, 'incomeAssetsFrozenTurnsRemaining' | 'incomeAssetsFrozenPlayerIds'>
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [idStr, million] of Object.entries(amounts)) {
    const id = Number(idStr)
    if (!Number.isFinite(id) || million <= 0) continue
    if (isPlayerIncomeFrozen(state, id)) continue
    out[id] = million
  }
  return out
}

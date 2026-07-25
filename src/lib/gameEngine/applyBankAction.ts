import type { GameState } from '@/lib/types'
import type { ApplyGameActionResult } from '@/lib/onlineGameActions'
import { actionCards } from '@/lib/cardData'
import { MAX_TURN_ACTIONS, replenishCurrentPlayerActionHand, turnLimitReached } from '@/lib/turnActions'
import { attachUndoSnapshotIfTurnAction } from '@/lib/undoLastAction'

/** Bank one or more action cards for their printed cash value (1 turn slot each). */
export function applyBankActionCards(
  state: GameState,
  instanceIds: string[]
): ApplyGameActionResult {
  if (instanceIds.length === 0) {
    return { ok: false, error: 'No cards to bank.', code: 'empty_bank' }
  }
  if (turnLimitReached(state.turnActionsConsumed)) {
    return { ok: false, error: `All ${MAX_TURN_ACTIONS} actions used.`, code: 'turn_limit' }
  }
  if ((state.turnActionsConsumed ?? 0) + instanceIds.length > MAX_TURN_ACTIONS) {
    return { ok: false, error: 'Not enough actions left to bank these cards.', code: 'turn_limit' }
  }

  const cpIdx = state.currentPlayerIndex
  const player = state.players[cpIdx]
  if (!player) return { ok: false, error: 'No active player.', code: 'no_player' }

  const ids = new Set(instanceIds)
  const toBank = player.actionCards.filter((c) => ids.has(c.instanceId))
  if (toBank.length !== instanceIds.length) {
    return { ok: false, error: 'Banked cards are not in hand.', code: 'missing_card' }
  }

  let cash = 0
  for (const inst of toBank) {
    const def = actionCards.find((a) => a.id === inst.cardId)
    cash += def?.bankValue ?? 0
  }

  const kept = player.actionCards.filter((c) => !ids.has(c.instanceId))
  const next: GameState = {
    ...state,
    players: state.players.map((p, i) =>
      i === cpIdx ? { ...p, money: p.money + cash, actionCards: kept } : p
    ),
    actionDiscard: [...state.actionDiscard, ...toBank],
    actionsPlayedThisTurn: state.actionsPlayedThisTurn + toBank.length,
    turnActionsConsumed: (state.turnActionsConsumed ?? 0) + toBank.length,
  }
  const replenished = replenishCurrentPlayerActionHand(next, cpIdx).state
  return {
    ok: true,
    state: attachUndoSnapshotIfTurnAction(state, replenished),
    events: [
      {
        type: 'toast',
        level: 'success',
        message: `Banked $${cash}M.`,
      },
    ],
  }
}

import type { GameState } from '@/lib/types'
import { isActionWildCard } from '@/lib/actionWildCard'
import { MAX_TURN_ACTIONS, replenishCurrentPlayerActionHand } from '@/lib/turnActions'
import {
  allocateInvestorPayoutsFromOwner,
  allocateMafiaTributeFromOwner,
  computeInvestorIncomeAwardsForOwner,
  getMafiaLevyForIncomePlayer,
} from '@/lib/utils'
import type { ApplyGameActionResult } from '@/lib/onlineGameActions'
import {
  consumeOnePendingIncomeTax,
  incomeTaxLevyMillion,
  pendingIncomeTaxCount,
} from '@/lib/cityTax'
import { canRollPropertyIncome, omitFrozenRecipientAmounts } from '@/lib/freezeAssets'

export type IncomeCompleteParams = {
  incomeInstanceId: string
  earnedIncome: number
  totalPropertyIncomeBase: number
  doubleIncomeInstanceId?: string
  incomeResolution: 'property-roll' | 'bank-income-card'
}

export function applyIncomeComplete(state: GameState, params: IncomeCompleteParams): ApplyGameActionResult {
  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer) return { ok: false, error: 'No active player.', code: 'no_player' }

  const incomeInst = currentPlayer.actionCards.find((c) => c.instanceId === params.incomeInstanceId)
  if (!incomeInst || (incomeInst.cardId !== 'income' && !isActionWildCard(incomeInst.cardId))) {
    return { ok: false, error: 'Income card not in hand.', code: 'missing_income' }
  }

  if (state.incomeResolvedThisTurn) {
    return { ok: false, error: 'Income already resolved this turn.', code: 'income_used' }
  }

  const ownerId = currentPlayer.id
  const isPropertyRoll = params.incomeResolution === 'property-roll'
  if (isPropertyRoll && !canRollPropertyIncome(state, ownerId)) {
    return {
      ok: false,
      error: state.endGameTriggered
        ? 'Final Round — property-income rolls are closed. Bank the Income card instead.'
        : 'Freeze Assets is in effect — you cannot collect property income this turn. Bank the Income card instead.',
      code: state.endGameTriggered ? 'final_round_income_lock' : 'income_frozen',
    }
  }

  let effectiveDoubleId = params.doubleIncomeInstanceId
  const consumedBefore = state.turnActionsConsumed ?? 0
  if (effectiveDoubleId && consumedBefore + 2 > MAX_TURN_ACTIONS) {
    effectiveDoubleId = undefined
  }

  const pendingTax = pendingIncomeTaxCount(state.pendingIncomeTaxPlayerIds, ownerId) > 0
  const levy = pendingTax ? incomeTaxLevyMillion(params.totalPropertyIncomeBase) : 0

  const { payoutByPlayerId: rawInvestorPayout } = isPropertyRoll
    ? computeInvestorIncomeAwardsForOwner(state.plots, ownerId)
    : { payoutByPlayerId: {} as Record<number, number> }
  const payoutByPlayerId = isPropertyRoll ? omitFrozenRecipientAmounts(rawInvestorPayout, state) : {}

  const { scaled: scaledInner, ownerKeeps: afterInvestors } = allocateInvestorPayoutsFromOwner(
    params.earnedIncome,
    payoutByPlayerId
  )
  const { recipientAmounts: rawMafiaOwed } = isPropertyRoll
    ? getMafiaLevyForIncomePlayer(ownerId, state.plots)
    : { recipientAmounts: {} as Record<number, number> }
  const mafiaOwed = isPropertyRoll ? omitFrozenRecipientAmounts(rawMafiaOwed, state) : {}
  const { scaled: mafiaRecipientAmounts, ownerKeeps: afterMafia } = allocateMafiaTributeFromOwner(
    afterInvestors,
    mafiaOwed
  )
  const cashFromIncome = pendingTax ? Math.max(0, afterMafia - levy) : afterMafia

  let updatedActionCards = currentPlayer.actionCards.filter(
    (c) => c.instanceId !== params.incomeInstanceId
  )
  if (effectiveDoubleId) {
    updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== effectiveDoubleId)
  }

  const doubleIncomeCardInstance = effectiveDoubleId
    ? currentPlayer.actionCards.find((c) => c.instanceId === effectiveDoubleId)
    : null

  const updatedPlayers = state.players.map((p, idx) => {
    if (idx === state.currentPlayerIndex) {
      return { ...p, money: p.money + cashFromIncome, actionCards: updatedActionCards }
    }
    const investorPay = isPropertyRoll ? scaledInner[p.id] ?? 0 : 0
    const mafiaPay = mafiaRecipientAmounts[p.id] ?? 0
    const payout = investorPay + mafiaPay
    return payout > 0 ? { ...p, money: p.money + payout } : p
  })

  const actionDiscardPile = [...state.actionDiscard, incomeInst]
  if (doubleIncomeCardInstance) actionDiscardPile.push(doubleIncomeCardInstance)

  const actionsPlayed = 1 + (effectiveDoubleId ? 1 : 0)
  const newTurnActionsConsumed = (state.turnActionsConsumed ?? 0) + actionsPlayed

  const nextPendingTax = pendingTax
    ? consumeOnePendingIncomeTax(state.pendingIncomeTaxPlayerIds, ownerId)
    : (state.pendingIncomeTaxPlayerIds ?? [])

  let newState: GameState = {
    ...state,
    players: updatedPlayers,
    actionDiscard: actionDiscardPile,
    actionsPlayedThisTurn: state.actionsPlayedThisTurn + actionsPlayed,
    turnActionsConsumed: newTurnActionsConsumed,
    incomeResolvedThisTurn: true,
    pendingIncomeTaxPlayerIds: nextPendingTax,
  }

  const { state: replenished } = replenishCurrentPlayerActionHand(newState, state.currentPlayerIndex)
  newState = replenished

  // Auto-advance is handled by applyGameAction when the 3-action budget is spent.
  return { ok: true, state: newState, events: [] }
}

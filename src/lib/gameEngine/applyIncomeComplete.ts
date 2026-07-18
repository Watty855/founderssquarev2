import type { GameState } from '@/lib/types'
import { MAX_TURN_ACTIONS, replenishCurrentPlayerActionHand, turnLimitReached } from '@/lib/turnActions'
import {
  allocateInvestorPayoutsFromOwner,
  allocateMafiaTributeFromOwner,
  computeInvestorIncomeAwardsForOwner,
  getMafiaLevyForIncomePlayer,
} from '@/lib/utils'
import type { ApplyGameActionResult } from '@/lib/onlineGameActions'

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
  if (!incomeInst || incomeInst.cardId !== 'income') {
    return { ok: false, error: 'Income card not in hand.', code: 'missing_income' }
  }

  if (state.incomeResolvedThisTurn) {
    return { ok: false, error: 'Income already resolved this turn.', code: 'income_used' }
  }

  let effectiveDoubleId = params.doubleIncomeInstanceId
  const consumedBefore = state.turnActionsConsumed ?? 0
  if (effectiveDoubleId && consumedBefore + 2 > MAX_TURN_ACTIONS) {
    effectiveDoubleId = undefined
  }

  const ownerId = currentPlayer.id
  const pendingTax = (state.pendingIncomeTaxPlayerIds ?? []).includes(ownerId)
  const levy = pendingTax ? Math.floor(params.totalPropertyIncomeBase * 0.5) : 0
  const isPropertyRoll = params.incomeResolution === 'property-roll'

  const { payoutByPlayerId } = isPropertyRoll
    ? computeInvestorIncomeAwardsForOwner(state.plots, ownerId)
    : { payoutByPlayerId: {} as Record<number, number> }

  const { scaled: scaledInner, ownerKeeps: afterInvestors } = allocateInvestorPayoutsFromOwner(
    params.earnedIncome,
    isPropertyRoll ? payoutByPlayerId : {}
  )
  const { recipientAmounts: mafiaOwed } = isPropertyRoll
    ? getMafiaLevyForIncomePlayer(ownerId, state.plots)
    : { recipientAmounts: {} as Record<number, number> }
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
    ? (state.pendingIncomeTaxPlayerIds ?? []).filter((id) => id !== ownerId)
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

  const events = []
  if (turnLimitReached(newTurnActionsConsumed)) {
    events.push({ type: 'toast' as const, level: 'info' as const, message: 'Turn limit reached — end turn.' })
  }

  return { ok: true, state: newState, events }
}

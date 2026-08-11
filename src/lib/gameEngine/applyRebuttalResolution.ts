import type { GameState, Plot } from '@/lib/types'
import { updatePlotAt } from '@/lib/boardIndex'
import { buildEndGameTriggerPatch } from '@/lib/gameEngine/statePatches'
import { replenishCurrentPlayerActionHand } from '@/lib/turnActions'

export type PendingRebuttal = NonNullable<GameState['pendingRebuttalRoll']>

/**
 * Clear an overthrown Anchor Tenet so the lot returns to vacant blueprint "Anchor Tenet"
 * and can be rebuilt by any eligible anchor card.
 */
export function vacateOverthrownAnchorPlot(plot: Plot): Plot {
  return {
    ...plot,
    claimedBy: undefined,
    builtProperty: undefined,
    anchorInfluenceSuppressed: undefined,
    investmentStripes: undefined,
    housingHighDensity: undefined,
  }
}

function spendActionCard(state: GameState, instanceId: string): GameState {
  const cpIdx = state.currentPlayerIndex
  const p = state.players[cpIdx]
  const inst = p.actionCards.find((c) => c.instanceId === instanceId)
  const updatedActionCards = p.actionCards.filter((c) => c.instanceId !== instanceId)
  const actionDiscardPile = inst ? [...state.actionDiscard, inst] : [...state.actionDiscard]
  return {
    ...state,
    players: state.players.map((pl, i) =>
      i === cpIdx ? { ...pl, actionCards: updatedActionCards } : pl
    ),
    actionDiscard: actionDiscardPile,
    actionsPlayedThisTurn: state.actionsPlayedThisTurn + 1,
    turnActionsConsumed: (state.turnActionsConsumed ?? 0) + 1,
    undoLastAction: undefined,
  }
}

/** Apply scandal effect when the defender fails to negate — vacate the Anchor Tenet lot. */
export function applyScandalOnFail(
  state: GameState,
  ctx: NonNullable<PendingRebuttal['scandalContext']>
): GameState {
  return {
    ...state,
    plots: updatePlotAt(state.plots, ctx.col, ctx.row, (plot) => {
      if (plot.builtProperty !== ctx.anchorCardId) return plot
      return vacateOverthrownAnchorPlot(plot)
    }),
  }
}

/** Apply hostile-takeover transfer when the defender fails to block. */
export function applyHostileTakeoverOnFail(
  state: GameState,
  ctx: NonNullable<PendingRebuttal['takeoverContext']>
): GameState {
  const cpIdx = state.currentPlayerIndex
  const attacker = state.players[cpIdx]
  const ownerIdx = state.players.findIndex((p) => p.id === ctx.ownerPlayerId)
  if (ownerIdx < 0 || !attacker || attacker.money < ctx.payment120Million) return state

  let transferred = false
  const newPlots = updatePlotAt(state.plots, ctx.col, ctx.row, (plot) => {
    if (plot.claimedBy !== ctx.ownerPlayerId) return plot
    transferred = true
    return {
      ...plot,
      claimedBy: attacker.id,
      investmentStripes: undefined,
    }
  })
  if (!transferred) return state

  const players = state.players.map((p, i) => {
    if (i === cpIdx) return { ...p, money: p.money - ctx.payment120Million }
    if (i === ownerIdx) return { ...p, money: p.money + ctx.payment120Million }
    return p
  })
  const baseUpdate: GameState = { ...state, players, plots: newPlots }
  const triggerPatch = buildEndGameTriggerPatch(state, newPlots, {
    row: ctx.row,
    col: ctx.col,
  })
  return { ...baseUpdate, ...triggerPatch }
}

/** Vacate all Mafia Anchor Tenet lots owned by the raid target when the counter fails. */
export function applyPoliceRaidOnFail(state: GameState, mafiaOwnerId: number): GameState {
  return {
    ...state,
    plots: state.plots.map((p) =>
      p.builtProperty === 'mafia' && p.claimedBy === mafiaOwnerId
        ? vacateOverthrownAnchorPlot(p)
        : p
    ),
  }
}

export type RebuttalResolution = {
  state: GameState
  negated: boolean
  plotLabel?: string
}

/**
 * Shared post-defender-roll step for scandal / hostile-takeover / police-raid.
 * Clears `pendingRebuttalRoll`, applies the fail effect when not negated, and
 * spends the attacker's action card for takeover / police raid.
 */
export function resolveRebuttalRoll(state: GameState, result: number): RebuttalResolution | null {
  const pending = state.pendingRebuttalRoll
  if (!pending) return null

  let negated = false
  let next: GameState = { ...state, pendingRebuttalRoll: undefined }

  if (pending.kind === 'scandal') {
    negated = result === 6
    if (!negated && pending.scandalContext) {
      next = applyScandalOnFail(next, pending.scandalContext)
    }
  } else if (pending.kind === 'hostile-takeover') {
    negated = result === 6
    if (!negated && pending.takeoverContext) {
      next = applyHostileTakeoverOnFail(next, pending.takeoverContext)
    }
    next = spendActionCard(next, pending.actionInstanceId)
    next = replenishCurrentPlayerActionHand(next, next.currentPlayerIndex).state
  } else if (pending.kind === 'police-raid') {
    const bonus = pending.policeRaidInfluenceBonus ?? 0
    const counterThreshold = bonus > 0 ? 5 : 6
    negated = result >= counterThreshold
    if (!negated) {
      next = applyPoliceRaidOnFail(next, pending.targetPlayerId)
    }
    next = spendActionCard(next, pending.actionInstanceId)
    next = replenishCurrentPlayerActionHand(next, next.currentPlayerIndex).state
  }

  const plotLabel =
    pending.kind === 'scandal' && pending.scandalContext
      ? `${pending.scandalContext.col}${pending.scandalContext.row}`
      : pending.kind === 'hostile-takeover' && pending.takeoverContext
        ? `${pending.takeoverContext.col}${pending.takeoverContext.row}`
        : undefined

  return { state: next, negated, plotLabel }
}

export { spendActionCard }

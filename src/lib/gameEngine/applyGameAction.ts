import type { GameState } from '@/lib/types'
import type { GameAction, ApplyGameActionResult } from '@/lib/onlineGameActions'
import {
  findHostSeatIndexForConnection,
  mergeHostAiTurnSnapshot,
  mergeRelayedGuestSnapshot,
} from '@/lib/partyBoardView'
import { parsePartyGameState } from '@/lib/partyBoardSync'
import { applyEndTurn, applyAnimationFlagsClear } from '@/lib/gameEngine/applyEndTurn'
import { attachUndoSnapshotIfTurnAction } from '@/lib/undoLastAction'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import { buildEndGameTriggerPatch } from '@/lib/gameEngine/statePatches'
import { replenishCurrentPlayerActionHand, turnLimitReached } from '@/lib/turnActions'

function verifyDefenderSeat(
  state: GameState,
  ctx: ApplyActionContext,
  targetPlayerId: number
): { ok: true; defenderIdx: number } | { ok: false; result: ApplyGameActionResult } {
  const defenderIdx = state.players.findIndex((p) => p.id === targetPlayerId)
  const defender = state.players[defenderIdx]
  if (!defender) {
    return { ok: false, result: { ok: false, error: 'Defender seat not found.', code: 'bad_defender' } }
  }
  if (defender.isAi) {
    if (!ctx.senderIsHost) {
      return { ok: false, result: { ok: false, error: 'AI seats are driven by the host.', code: 'ai_seat' } }
    }
  } else {
    const senderIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
    if (senderIdx !== defenderIdx) {
      return { ok: false, result: { ok: false, error: 'Only the defending founder may roll.', code: 'wrong_defender' } }
    }
  }
  return { ok: true, defenderIdx }
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

export type ApplyActionContext = {
  senderConnectionId: string
  /** Sender is the room host device — the host drives AI seats on their turns. */
  senderIsHost?: boolean
}

function assertActorTurn(state: GameState, ctx: ApplyActionContext): ApplyGameActionResult | null {
  const acting = state.players[state.currentPlayerIndex]
  if (acting?.isAi) {
    if (ctx.senderIsHost) return null
    return { ok: false, error: 'AI seats are driven by the host.', code: 'ai_seat' }
  }
  const seatIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
  if (seatIdx < 0) {
    return { ok: false, error: 'Your seat is not registered at this table.', code: 'unknown_seat' }
  }
  if (seatIdx !== state.currentPlayerIndex) {
    return { ok: false, error: 'Not your turn.', code: 'wrong_turn' }
  }
  return null
}

/** PartyKit-authoritative apply — shared with optimistic client preview. */
export function applyGameAction(
  state: GameState,
  action: GameAction,
  ctx: ApplyActionContext
): ApplyGameActionResult {
  if (!state.isSetupComplete) {
    return { ok: false, error: 'Game not started.', code: 'not_started' }
  }

  switch (action.type) {
    case 'end_turn': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      return applyEndTurn(state)
    }

    case 'build_at': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      const result = applyBuildAt(state, action)
      if (!result.ok) return result
      return {
        ...result,
        state: attachUndoSnapshotIfTurnAction(state, result.state),
      }
    }

    case 'income_complete': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      const result = applyIncomeComplete(state, action)
      if (!result.ok) return result
      return {
        ...result,
        state: attachUndoSnapshotIfTurnAction(state, result.state),
      }
    }

    case 'animation_flags_clear':
      return applyAnimationFlagsClear(state)

    case 'discard_action_cards': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      const cur = state.players[state.currentPlayerIndex]
      const ids = new Set(action.instanceIds)
      const removed = cur.actionCards.filter((c) => ids.has(c.instanceId))
      if (removed.length !== action.instanceIds.length) {
        return { ok: false, error: 'Discarded cards are not in the acting hand.', code: 'bad_discard' }
      }
      const kept = cur.actionCards.filter((c) => !ids.has(c.instanceId))
      const discarded: GameState = {
        ...state,
        players: state.players.map((p, idx) =>
          idx === state.currentPlayerIndex ? { ...p, actionCards: kept } : p
        ),
        actionDiscard: [...state.actionDiscard, ...removed],
      }
      // Re-run end turn: hand is now within limits, so the turn advances.
      return applyEndTurn(discarded)
    }

    case 'council_freeze_defense': {
      const pending = state.pendingCouncilFreezeDefense
      if (!pending) {
        return { ok: false, error: 'No council-freeze defense is pending.', code: 'no_pending_defense' }
      }
      const defenderIdx = state.players.findIndex((p) => p.id === pending.targetPlayerId)
      const defender = state.players[defenderIdx]
      if (!defender) {
        return { ok: false, error: 'Defender seat not found.', code: 'bad_defender' }
      }
      // Only the device controlling the defender seat may report the roll.
      if (defender.isAi) {
        if (!ctx.senderIsHost) {
          return { ok: false, error: 'AI seats are driven by the host.', code: 'ai_seat' }
        }
      } else {
        const senderIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
        if (senderIdx !== defenderIdx) {
          return { ok: false, error: 'Only the frozen founder rolls the defense die.', code: 'wrong_defender' }
        }
      }
      const result = Math.round(action.result)
      if (!(result >= 1 && result <= 6)) {
        return { ok: false, error: 'Invalid die result.', code: 'bad_roll' }
      }
      const negated = result === 6
      const next: GameState = {
        ...state,
        pendingCouncilFreezeDefense: undefined,
        councilFreezeBlockBuildForPlayerId: negated
          ? state.councilFreezeBlockBuildForPlayerId
          : pending.targetPlayerId,
      }
      return {
        ok: true,
        state: next,
        events: [
          {
            type: 'council_freeze_result',
            targetName: pending.targetName,
            result,
            negated,
          },
        ],
      }
    }

    case 'rebuttal_roll': {
      const pending = state.pendingRebuttalRoll
      if (!pending) {
        return { ok: false, error: 'No rebuttal roll is pending.', code: 'no_pending_rebuttal' }
      }
      const seat = verifyDefenderSeat(state, ctx, pending.targetPlayerId)
      if (!seat.ok) return seat.result
      const result = Math.round(action.result)
      if (!(result >= 1 && result <= 6)) {
        return { ok: false, error: 'Invalid die result.', code: 'bad_roll' }
      }

      let negated = false
      let next: GameState = { ...state, pendingRebuttalRoll: undefined }

      if (pending.kind === 'scandal') {
        negated = result === 6
        const ctxScandal = pending.scandalContext
        if (!negated && ctxScandal) {
          const plotIndex = next.plots.findIndex((p) => p.row === ctxScandal.row && p.col === ctxScandal.col)
          if (plotIndex >= 0) {
            const plot = next.plots[plotIndex]
            if (plot.builtProperty === ctxScandal.anchorCardId) {
              const newPlots = [...next.plots]
              newPlots[plotIndex] = { ...plot, anchorInfluenceSuppressed: true }
              next = { ...next, plots: newPlots }
            }
          }
        }
      } else if (pending.kind === 'hostile-takeover') {
        negated = result === 6
        const ctxTakeover = pending.takeoverContext
        if (!negated && ctxTakeover) {
          const cpIdx = next.currentPlayerIndex
          const attacker = next.players[cpIdx]
          const ownerIdx = next.players.findIndex((p) => p.id === ctxTakeover.ownerPlayerId)
          const plotIndex = next.plots.findIndex((p) => p.row === ctxTakeover.row && p.col === ctxTakeover.col)
          if (plotIndex >= 0 && ownerIdx >= 0 && attacker.money >= ctxTakeover.payment120Million) {
            const plot = next.plots[plotIndex]
            if (plot.claimedBy === ctxTakeover.ownerPlayerId) {
              const newPlots = [...next.plots]
              newPlots[plotIndex] = {
                ...plot,
                claimedBy: attacker.id,
                investmentStripes: undefined,
              }
              const players = next.players.map((p, i) => {
                if (i === cpIdx) return { ...p, money: p.money - ctxTakeover.payment120Million }
                if (i === ownerIdx) return { ...p, money: p.money + ctxTakeover.payment120Million }
                return p
              })
              const baseUpdate: GameState = { ...next, players, plots: newPlots }
              const triggerPatch = buildEndGameTriggerPatch(next, newPlots, {
                row: ctxTakeover.row,
                col: ctxTakeover.col,
              })
              next = { ...baseUpdate, ...triggerPatch }
            }
          }
        }
        next = spendActionCard(next, pending.actionInstanceId)
        if (turnLimitReached(next.turnActionsConsumed ?? 0)) {
          // End turn scheduling is client-side; authority only marks consumption.
        }
        next = replenishCurrentPlayerActionHand(next, next.currentPlayerIndex).state
      } else if (pending.kind === 'police-raid') {
        const bonus = pending.policeRaidInfluenceBonus ?? 0
        const counterThreshold = bonus > 0 ? 5 : 6
        negated = result >= counterThreshold
        if (!negated) {
          const mafiaOwnerId = pending.targetPlayerId
          const newPlots = next.plots.map((p) =>
            p.builtProperty === 'mafia' && p.claimedBy === mafiaOwnerId
              ? { ...p, anchorInfluenceSuppressed: true }
              : p
          )
          next = { ...next, plots: newPlots }
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

      return {
        ok: true,
        state: next,
        events: [
          {
            type: 'rebuttal_result',
            kind: pending.kind,
            targetName: pending.targetName,
            attackerName: pending.attackerName,
            result,
            negated,
            plotLabel,
          },
        ],
      }
    }

    case 'play_cards':
      return {
        ok: false,
        error: 'Complex card play must use commit_actor_state after local resolution.',
        code: 'use_commit',
      }

    case 'commit_actor_state': {
      const parsed = parsePartyGameState(action.state)
      if (!parsed) return { ok: false, error: 'Invalid game state.', code: 'bad_state' }
      const acting = parsed.players[parsed.currentPlayerIndex]
      if (!acting) {
        return { ok: false, error: 'Invalid acting player.', code: 'bad_actor' }
      }
      if (acting.isAi) {
        if (!ctx.senderIsHost) {
          return { ok: false, error: 'AI seats are driven by the host.', code: 'ai_seat' }
        }
        const mergedAi = mergeHostAiTurnSnapshot(state, parsed)
        if (!mergedAi) return { ok: false, error: 'Could not merge the AI update.', code: 'merge_failed' }
        return { ok: true, state: mergedAi, events: [] }
      }
      const seatIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
      if (seatIdx < 0) {
        return { ok: false, error: 'Unknown seat.', code: 'unknown_seat' }
      }
      if (seatIdx !== parsed.currentPlayerIndex) {
        return { ok: false, error: 'State commit must be on your turn.', code: 'wrong_turn' }
      }
      const merged = mergeRelayedGuestSnapshot(state, ctx.senderConnectionId, parsed)
      if (!merged) return { ok: false, error: 'Could not merge your update.', code: 'merge_failed' }
      return { ok: true, state: merged, events: [] }
    }

    default:
      return { ok: false, error: 'Unknown action.', code: 'unknown_action' }
  }
}

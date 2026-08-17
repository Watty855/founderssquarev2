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
import { resolveRebuttalRoll } from '@/lib/gameEngine/applyRebuttalResolution'
import { applyCalamityRoll, currentCalamityRoller } from '@/lib/calamity'
import {
  MAX_ACTION_HAND_SIZE,
  MAX_TURN_ACTIONS,
  actionHandDiscardCount,
  shouldAutoAdvanceTurn,
  turnLimitReached,
} from '@/lib/turnActions'

/** After a fully-resolved action, advance the turn when all 3 action slots are spent. */
function withAutoAdvanceIfBudgetSpent(result: ApplyGameActionResult): ApplyGameActionResult {
  if (!result.ok) return result
  if (!shouldAutoAdvanceTurn(result.state)) return result
  const end = applyEndTurn(result.state)
  if (!end.ok) return result
  const discardPending = end.events.some((e) => e.type === 'discard_required')
  const turnAdvanced = end.events.some((e) => e.type === 'turn_changed')
  const toastMessage = discardPending
    ? `All ${MAX_TURN_ACTIONS} actions used — discard down to ${MAX_ACTION_HAND_SIZE} action cards to end your turn.`
    : turnAdvanced
      ? `All ${MAX_TURN_ACTIONS} actions used — next founder's turn.`
      : null
  return {
    ok: true,
    state: end.state,
    events: [
      ...result.events,
      ...end.events,
      ...(toastMessage
        ? [{ type: 'toast' as const, level: 'info' as const, message: toastMessage }]
        : []),
    ],
  }
}

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
      return applyEndTurn(state, {
        expectedSeatIndex: action.seatIndex ?? state.currentPlayerIndex,
      })
    }

    case 'build_at': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      const result = applyBuildAt(state, action)
      if (!result.ok) return result
      return withAutoAdvanceIfBudgetSpent({
        ...result,
        state: attachUndoSnapshotIfTurnAction(state, result.state),
      })
    }

    case 'income_complete': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      const result = applyIncomeComplete(state, action)
      if (!result.ok) return result
      return withAutoAdvanceIfBudgetSpent({
        ...result,
        state: attachUndoSnapshotIfTurnAction(state, result.state),
      })
    }

    case 'animation_flags_clear':
      return applyAnimationFlagsClear(state)

    case 'discard_action_cards': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      // Mid-turn / start-of-turn over-hand is legal — only accept discards after the
      // 3-action budget is spent (or the engine already opened the end-turn discard).
      if (
        !state.awaitingEndTurnActionDiscard &&
        !turnLimitReached(state.turnActionsConsumed)
      ) {
        return {
          ok: false,
          error: `Action-hand discard is only required after all ${MAX_TURN_ACTIONS} turn actions.`,
          code: 'discard_too_early',
        }
      }
      const cur = state.players[state.currentPlayerIndex]
      const need = actionHandDiscardCount(cur.actionCards.length)
      if (need <= 0) {
        return { ok: false, error: 'No end-of-turn action discard is required.', code: 'no_discard' }
      }
      if (action.instanceIds.length !== need) {
        return {
          ok: false,
          error: `Discard exactly ${need} action card${need === 1 ? '' : 's'} to end your turn.`,
          code: 'bad_discard_count',
        }
      }
      const ids = new Set(action.instanceIds)
      if (ids.size !== action.instanceIds.length) {
        return { ok: false, error: 'Duplicate discard selection.', code: 'bad_discard' }
      }
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
        awaitingEndTurnActionDiscard: undefined,
      }
      // Re-run end turn: hand is now within the soft cap, so the turn advances.
      // The next founder may draw 2 and exceed the cap until *their* end of turn.
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
      return withAutoAdvanceIfBudgetSpent({
        ok: true,
        state: next,
        events: [
          {
            type: 'council_freeze_result',
            attackerName: pending.attackerName,
            targetName: pending.targetName,
            result,
            negated,
          },
        ],
      })
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

      const resolved = resolveRebuttalRoll(state, result)
      if (!resolved) {
        return { ok: false, error: 'No rebuttal roll is pending.', code: 'no_pending_rebuttal' }
      }

      return withAutoAdvanceIfBudgetSpent({
        ok: true,
        state: resolved.state,
        events: [
          {
            type: 'rebuttal_result',
            kind: pending.kind,
            targetName: pending.targetName,
            attackerName: pending.attackerName,
            result,
            negated: resolved.negated,
            plotLabel: resolved.plotLabel,
          },
        ],
      })
    }

    case 'calamity_roll': {
      const pending = state.pendingCalamity
      if (!pending) {
        return { ok: false, error: 'No calamity is pending.', code: 'no_pending_calamity' }
      }
      const roller = currentCalamityRoller(state)
      if (!roller) {
        return { ok: false, error: 'Calamity roller not found.', code: 'bad_roller' }
      }
      if (roller.isAi) {
        if (!ctx.senderIsHost) {
          return { ok: false, error: 'AI seats are driven by the host.', code: 'ai_seat' }
        }
      } else {
        const senderIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
        const rollerIdx = state.players.findIndex((p) => p.id === roller.id)
        if (senderIdx !== rollerIdx) {
          return { ok: false, error: 'Only the current calamity founder may roll.', code: 'wrong_calamity_roller' }
        }
      }
      const applied = applyCalamityRoll(state, action.result, action.variantKey)
      if (!applied.ok) {
        return { ok: false, error: applied.error, code: applied.code }
      }
      return withAutoAdvanceIfBudgetSpent({
        ok: true,
        state: applied.state,
        events: [
          {
            type: 'calamity_result',
            playerName: applied.playerName,
            result: applied.result,
            percent: applied.percent,
            lossMillion: applied.lossMillion,
            variantTitle: applied.variant.title,
            variantFlavor: applied.variant.flavor,
            cityWideComplete: applied.cityWideComplete,
          },
        ],
      })
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

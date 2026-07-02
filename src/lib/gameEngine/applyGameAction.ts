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

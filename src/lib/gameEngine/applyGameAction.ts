import type { GameState } from '@/lib/types'
import type { GameAction, ApplyGameActionResult } from '@/lib/onlineGameActions'
import { findHostSeatIndexForConnection, mergeRelayedGuestSnapshot } from '@/lib/partyBoardView'
import { parsePartyGameState } from '@/lib/partyBoardSync'
import { applyEndTurn, applyAnimationFlagsClear } from '@/lib/gameEngine/applyEndTurn'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'

export type ApplyActionContext = {
  senderConnectionId: string
}

function assertActorTurn(state: GameState, ctx: ApplyActionContext): ApplyGameActionResult | null {
  const seatIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
  if (seatIdx < 0) {
    return { ok: false, error: 'Your seat is not registered at this table.', code: 'unknown_seat' }
  }
  if (seatIdx !== state.currentPlayerIndex) {
    return { ok: false, error: 'Not your turn.', code: 'wrong_turn' }
  }
  const p = state.players[seatIdx]
  if (p?.isAi) {
    return { ok: false, error: 'AI seats are driven by the host.', code: 'ai_seat' }
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
      return applyBuildAt(state, action)
    }

    case 'income_complete': {
      const turnErr = assertActorTurn(state, ctx)
      if (turnErr) return turnErr
      return applyIncomeComplete(state, action)
    }

    case 'animation_flags_clear':
      return applyAnimationFlagsClear(state)

    case 'play_cards':
      return {
        ok: false,
        error: 'Complex card play must use commit_actor_state after local resolution.',
        code: 'use_commit',
      }

    case 'commit_actor_state': {
      const parsed = parsePartyGameState(action.state)
      if (!parsed) return { ok: false, error: 'Invalid game state.', code: 'bad_state' }
      const seatIdx = findHostSeatIndexForConnection(state, ctx.senderConnectionId)
      if (seatIdx < 0) {
        return { ok: false, error: 'Unknown seat.', code: 'unknown_seat' }
      }
      const acting = parsed.players[parsed.currentPlayerIndex]
      if (!acting || acting.isAi) {
        return { ok: false, error: 'Invalid acting player.', code: 'bad_actor' }
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

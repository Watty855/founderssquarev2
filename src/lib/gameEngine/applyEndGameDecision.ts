import type { GameState } from '@/lib/types'
import type { ApplyGameActionResult } from '@/lib/onlineGameActions'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { shouldAutoAdvanceTurn } from '@/lib/turnActions'

function declareFinalRound(state: GameState): GameState {
  const pending = state.pendingEndGameDeclaration
  const declarerId = pending?.playerId ?? state.players[state.currentPlayerIndex]?.id
  const cluster = pending?.plots
  return {
    ...state,
    pendingEndGameDeclaration: undefined,
    endGameDeclarationOfferedThisTurn: true,
    endGameTriggered: true,
    endGameTriggerPlayerId: declarerId,
    endGameTriggerLocation: cluster?.[0],
    winningSequence: cluster,
    finalRoundTurnsRemaining: state.players.length + 1,
  }
}

/**
 * Resolve the declare/continue prompt. Declaring starts the Final Round (one more turn
 * each, including the declarer). Continuing on the fourth additional turn ends the game
 * immediately; otherwise play proceeds.
 */
export function applyEndGameDecision(
  state: GameState,
  declare: boolean
): ApplyGameActionResult {
  const pending = state.pendingEndGameDeclaration
  if (!pending) {
    return { ok: false, error: 'No endgame declaration is pending.', code: 'no_endgame_pending' }
  }
  const acting = state.players[state.currentPlayerIndex]
  if (!acting || acting.id !== pending.playerId) {
    return { ok: false, error: 'Only the eligible founder may declare the endgame.', code: 'wrong_endgame_player' }
  }

  if (declare) {
    const declared = declareFinalRound(state)
    const declarerName = acting.name
    const events = [
      {
        type: 'toast' as const,
        level: 'success' as const,
        message: `${declarerName} declared the endgame — Final Round! Each founder gets one more turn.`,
      },
    ]
    if (pending.phase === 'end-of-turn' || shouldAutoAdvanceTurn({ ...declared, pendingEndGameDeclaration: undefined })) {
      const ended = applyEndTurn(declared)
      if (!ended.ok) return { ok: true, state: declared, events }
      return { ok: true, state: ended.state, events: [...events, ...ended.events] }
    }
    return { ok: true, state: declared, events }
  }

  if (pending.lastChance) {
    return {
      ok: true,
      state: {
        ...state,
        pendingEndGameDeclaration: undefined,
        gameEnded: true,
        winningSequence: pending.plots,
      },
      events: [{ type: 'game_over', reason: 'endgame-deadline' }],
    }
  }

  const remaining = pending.consumesDefer
    ? Math.max(0, (state.endGameDeferTurnsRemaining ?? pending.deferTurnsRemaining) - 1)
    : (state.endGameDeferTurnsRemaining ?? pending.deferTurnsRemaining)

  const continued: GameState = {
    ...state,
    pendingEndGameDeclaration: undefined,
    endGameDeclarationOfferedThisTurn: true,
    endGameDeferTurnsRemaining: remaining,
  }

  const continueEvents = [
    {
      type: 'toast' as const,
      level: 'info' as const,
      message: pending.consumesDefer
        ? `${acting.name} continues play (${remaining} additional turn${remaining === 1 ? '' : 's'} left to declare).`
        : `${acting.name} continues play — they may declare the endgame at the end of a later turn.`,
    },
  ]

  if (pending.phase === 'end-of-turn' || shouldAutoAdvanceTurn(continued)) {
    const ended = applyEndTurn(continued)
    if (!ended.ok) return { ok: true, state: continued, events: continueEvents }
    return { ok: true, state: ended.state, events: [...continueEvents, ...ended.events] }
  }

  return { ok: true, state: continued, events: continueEvents }
}

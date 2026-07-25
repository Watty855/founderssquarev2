import { describe, expect, it } from 'vitest'
import {
  applyHostileTakeoverOnFail,
  applyPoliceRaidOnFail,
  applyScandalOnFail,
  resolveRebuttalRoll,
} from '@/lib/gameEngine/applyRebuttalResolution'
import type { GameState, Player, Plot } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'

function mkPlayer(id: number, name: string, money = 50): Player {
  return {
    id,
    name,
    color: '#fff',
    money,
    actionCards: [{ instanceId: `act-${id}`, cardId: 'hostile-takeover', cardNumber: id }],
    propertyCards: [],
    isAi: id > 1,
  }
}

function baseState(over: Partial<GameState> = {}): GameState {
  const plots = createInitialBoard()
  return {
    players: [mkPlayer(1, 'A', 40), mkPlayer(2, 'B', 10)],
    plots,
    currentPlayerIndex: 0,
    isSetupComplete: true,
    actionDeck: [],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    crossingTheLineActive: false,
    ...over,
  }
}

describe('rebuttal resolution helpers', () => {
  it('scandal fail suppresses anchor influence on the target lot', () => {
    let state = baseState()
    state = {
      ...state,
      plots: updatePlotAt(state.plots, 'C', 3, (p) => ({
        ...p,
        builtProperty: 'church',
        claimedBy: 2,
      })),
    }
    const next = applyScandalOnFail(state, {
      row: 3,
      col: 'C',
      anchorCardId: 'church',
      anchorOwnerPlayerId: 2,
    })
    const plot = next.plots.find((p) => p.row === 3 && p.col === 'C')
    expect(plot?.anchorInfluenceSuppressed).toBe(true)
  })

  it('hostile takeover fail transfers ownership and pays 120%', () => {
    let state = baseState()
    state = {
      ...state,
      plots: updatePlotAt(state.plots, 'B', 2, (p) => ({
        ...p,
        builtProperty: 'restaurant',
        claimedBy: 2,
      })),
    }
    const next = applyHostileTakeoverOnFail(state, {
      row: 2,
      col: 'B',
      ownerPlayerId: 2,
      payment120Million: 12,
    })
    const plot = next.plots.find((p) => p.row === 2 && p.col === 'B') as Plot
    expect(plot.claimedBy).toBe(1)
    expect(next.players[0].money).toBe(28)
    expect(next.players[1].money).toBe(22)
  })

  it('police raid fail suppresses rival mafia anchors', () => {
    let state = baseState()
    state = {
      ...state,
      plots: updatePlotAt(state.plots, 'G', 7, (p) => ({
        ...p,
        builtProperty: 'mafia',
        claimedBy: 2,
      })),
    }
    const next = applyPoliceRaidOnFail(state, 2)
    const plot = next.plots.find((p) => p.row === 7 && p.col === 'G')
    expect(plot?.anchorInfluenceSuppressed).toBe(true)
  })

  it('resolveRebuttalRoll negates scandal on a 6', () => {
    let state = baseState({
      pendingRebuttalRoll: {
        kind: 'scandal',
        targetPlayerId: 2,
        attackerPlayerId: 1,
        targetName: 'B',
        attackerName: 'A',
        actionInstanceId: 'act-1',
        scandalContext: {
          row: 3,
          col: 'C',
          anchorCardId: 'church',
          anchorOwnerPlayerId: 2,
        },
      },
    })
    state = {
      ...state,
      plots: updatePlotAt(state.plots, 'C', 3, (p) => ({
        ...p,
        builtProperty: 'church',
        claimedBy: 2,
      })),
    }
    const resolved = resolveRebuttalRoll(state, 6)
    expect(resolved?.negated).toBe(true)
    const plot = resolved?.state.plots.find((p) => p.row === 3 && p.col === 'C')
    expect(plot?.anchorInfluenceSuppressed).toBeFalsy()
    expect(resolved?.state.pendingRebuttalRoll).toBeUndefined()
  })
})

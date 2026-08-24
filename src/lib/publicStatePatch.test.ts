import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import type { PublicGameState } from '@/lib/onlinePublicState'
import {
  applyPublicGameStatePatch,
  diffPublicGameState,
  patchIsCheaperThanKeyframe,
  shouldSendPublicKeyframe,
} from '@/lib/publicStatePatch'

function pub(over: Partial<PublicGameState> = {}): PublicGameState {
  return {
    players: [
      {
        id: 1,
        name: 'A',
        color: '#fff',
        money: 20,
        peerHandCounts: { actions: 5, properties: 5 },
      },
      {
        id: 2,
        name: 'B',
        color: '#000',
        money: 20,
        peerHandCounts: { actions: 5, properties: 5 },
      },
    ],
    plots: createInitialBoard(),
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

describe('public state patches', () => {
  it('keyframes join and every 8th rev', () => {
    expect(shouldSendPublicKeyframe(1, false)).toBe(true)
    expect(shouldSendPublicKeyframe(2, true)).toBe(false)
    expect(shouldSendPublicKeyframe(8, true)).toBe(true)
    expect(shouldSendPublicKeyframe(9, true)).toBe(false)
  })

  it('diffs money and a single lot, then applies back to the next snapshot', () => {
    const a = pub()
    const b = pub({
      players: a.players.map((p) => (p.id === 1 ? { ...p, money: 17 } : p)),
      plots: a.plots.map((p) =>
        p.row === 2 && p.col === 'C' ? { ...p, claimedBy: 1, builtProperty: 'housing' } : p
      ),
      turnActionsConsumed: 1,
    })
    const patch = diffPublicGameState(a, b, 3, 4)
    expect(patch.plotsChanged).toHaveLength(1)
    expect(patch.playersChanged).toHaveLength(1)
    expect(patch.playersChanged?.[0].money).toBe(17)
    expect(patch.rest?.turnActionsConsumed).toBe(1)
    const restored = applyPublicGameStatePatch(a, patch)
    expect(restored.players[0].money).toBe(17)
    expect(restored.turnActionsConsumed).toBe(1)
    const lot = restored.plots.find((p) => p.row === 2 && p.col === 'C')
    expect(lot?.builtProperty).toBe('housing')
    expect(patchIsCheaperThanKeyframe(patch, a.plots.length)).toBe(true)
  })
})

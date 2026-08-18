'use client'

import type { GameState } from '@/lib/types'
import { findCompleteSquares, findCompleteStreets } from '@/lib/utils'
import type { NamedSquare, NamedStreet } from '@/components/game/GameBoard'

export type BoardPlayerColor = { id: number; color: string; name: string }

let playerColorKey = ''
let playerColorCache: BoardPlayerColor[] = []

export function selectBoardPlayerColors(gs: GameState): BoardPlayerColor[] {
  const key = gs.players.map((p) => `${p.id}:${p.color}:${p.name}`).join('|')
  if (key === playerColorKey) return playerColorCache
  playerColorKey = key
  playerColorCache = gs.players.map((p) => ({ id: p.id, color: p.color, name: p.name }))
  return playerColorCache
}

const EMPTY_SQUARES: NamedSquare[] = []
const EMPTY_STREETS: NamedStreet[] = []

let namedKey = ''
let namedCache: { squares: NamedSquare[]; streets: NamedStreet[] } = {
  squares: EMPTY_SQUARES,
  streets: EMPTY_STREETS,
}

export function selectNamedRegions(gs: GameState): { squares: NamedSquare[]; streets: NamedStreet[] } {
  if (!gs.gameEnded) {
    if (namedKey === 'open') return namedCache
    namedKey = 'open'
    namedCache = { squares: EMPTY_SQUARES, streets: EMPTY_STREETS }
    return namedCache
  }
  const key = `ended|${gs.plots.length}|${gs.players.map((p) => p.id).join(',')}`
  if (key === namedKey) return namedCache
  namedKey = key
  const playerById = new Map(gs.players.map((p) => [p.id, p]))
  namedCache = {
    squares: findCompleteSquares(gs.plots).map((s) => {
      const p = playerById.get(s.ownerPlayerId)
      return {
        ownerPlayerId: s.ownerPlayerId,
        name: `${p?.name ?? 'Founder'} Square`,
        bounds: s.bounds,
        lots: s.lots,
        color: p?.color ?? 'rgba(255,255,255,0.6)',
      }
    }),
    streets: findCompleteStreets(gs.plots).map((s) => {
      const p = playerById.get(s.ownerPlayerId)
      return {
        ownerPlayerId: s.ownerPlayerId,
        name: `${p?.name ?? 'Founder'} Street`,
        orientation: s.orientation,
        lots: s.lots,
        streetSegment: s.streetSegment,
        color: p?.color ?? 'rgba(255,255,255,0.6)',
      }
    }),
  }
  return namedCache
}

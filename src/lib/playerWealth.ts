import { propertyCards } from './cardData'
import { getPlotPropertyEndValue, getPlotPropertyIncome } from './housingEconomics'
import { findCompleteSquares, findCompleteStreets, getParkIncomeBonusForPlayer } from './utils'
import type { GameState, Player, PlayerScore, Plot } from './types'

/** Book value of this founder's Investment / Double Investment stripes on the board. */
export function sumInvestmentBookForPlayer(plots: Plot[], investorId: number): number {
  let s = 0
  for (const p of plots) {
    p.investmentStripes?.forEach((t) => {
      if (t.investorId === investorId) s += t.contributionMillion
    })
  }
  return s
}

/** End-game book of lots this founder has built (unplayed hand cards are ignored). */
export function sumBuiltPropertyEndValue(plots: Plot[], ownerId: number): number {
  let v = 0
  for (const plot of plots) {
    if (plot.claimedBy !== ownerId || !plot.builtProperty) continue
    const card = propertyCards.find((c) => c.id === plot.builtProperty)
    v += getPlotPropertyEndValue(plot, card)
  }
  return v
}

/**
 * Property standing: built end-game values plus this founder's investment book.
 * Unplayed cards still in hand are excluded — bank them (cash) or build/invest first.
 */
export function sumPlayerPropertyValue(plots: Plot[], playerId: number): number {
  return sumBuiltPropertyEndValue(plots, playerId) + sumInvestmentBookForPlayer(plots, playerId)
}

export function countOwnedBuiltProperties(plots: Plot[], ownerId: number): number {
  let n = 0
  for (const p of plots) {
    if (p.claimedBy === ownerId && p.builtProperty) n += 1
  }
  return n
}

export function playerIncomePerTurn(plots: Plot[], playerId: number): number {
  let totalIncome = 0
  for (const plot of plots) {
    if (plot.claimedBy !== playerId || !plot.builtProperty) continue
    const card = propertyCards.find((c) => c.id === plot.builtProperty)
    totalIncome += getPlotPropertyIncome(plot, card)
  }
  return totalIncome + getParkIncomeBonusForPlayer(playerId, plots).bonus
}

/**
 * End-game / live standing: cash + property (including investments) + Square/Street bonuses.
 * Banked cards are already in `player.money` (cash, exposed to Calamity). Hand cards score 0.
 */
export function calculateFinalScores(state: Pick<GameState, 'players' | 'plots'>): PlayerScore[] {
  const allSquares = findCompleteSquares(state.plots)
  const allStreets = findCompleteStreets(state.plots)

  return state.players.map((player) => {
    const propertyValue = sumPlayerPropertyValue(state.plots, player.id)
    const squareBonuses = allSquares
      .filter((s) => s.ownerPlayerId === player.id)
      .map((s) => ({
        name: `${player.name} Square`,
        bonusMillion: s.bonusMillion,
        bounds: s.bounds,
        lots: s.lots,
      }))
    const streetBonuses = allStreets
      .filter((s) => s.ownerPlayerId === player.id)
      .map((s) => ({
        name: `${player.name} Street`,
        bonusMillion: s.bonusMillion,
        orientation: s.orientation,
        lots: s.lots,
        streetSegment: s.streetSegment,
      }))
    const bonusMillion =
      squareBonuses.reduce((acc, b) => acc + b.bonusMillion, 0) +
      streetBonuses.reduce((acc, b) => acc + b.bonusMillion, 0)

    return {
      player,
      cashInHand: player.money,
      propertyValue,
      bonusMillion,
      squareBonuses,
      streetBonuses,
      totalScore: player.money + propertyValue + bonusMillion,
      propertiesOwned: countOwnedBuiltProperties(state.plots, player.id),
    }
  })
}

/** Live HUD figures — same scoring as the end-game dialog, plus income. */
export function playerStandingStats(plots: Plot[], player: Player) {
  const score = calculateFinalScores({ players: [player], plots })[0]!
  return {
    cash: score.cashInHand,
    propertyValue: score.propertyValue,
    bonusMillion: score.bonusMillion,
    standingTotal: score.totalScore,
    income: playerIncomePerTurn(plots, player.id),
  }
}

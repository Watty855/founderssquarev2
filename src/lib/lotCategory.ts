import type { PropertyCard } from './cardTypes'
import type { Plot } from './types'
import { CIVIC_VARIANT_PROPERTY_IDS } from './cardData'
import { getAnchorCornerNotation, getPropertyCornerLetter } from './cardCornerLetter'

/** Board parenthetical letters from the physical game board CSV. */
export type LotCategoryLetter = 'C' | 'A' | 'T' | 'P' | 'M' | 'H' | 'I' | 'D' | 'S' | 'F' | 'O' | 'E' | 'AT'

const CIVIC_PROPERTY_IDS = new Set<string>(CIVIC_VARIANT_PROPERTY_IDS)

/** Property / anchor card name → board letter (Commercial = M, Entertainment = E). */
const CARD_NAME_TO_LOT_LETTER: Record<string, LotCategoryLetter> = {
  Civic: 'C',
  'Civic Center': 'C',
  'City Hall': 'C',
  Courthouse: 'C',
  Police: 'C',
  Arts: 'E',
  Hotel: 'T',
  Park: 'P',
  Commercial: 'M',
  Housing: 'H',
  Industry: 'I',
  Freight: 'D',
  Storage: 'S',
  Food: 'F',
  Power: 'O',
}

export function getCardLotLetter(card: Pick<PropertyCard, 'name' | 'type' | 'id'>): LotCategoryLetter | null {
  if (card.type === 'anchor') return null
  if (CIVIC_PROPERTY_IDS.has(card.id)) return 'C'
  return CARD_NAME_TO_LOT_LETTER[card.name] ?? null
}

/** Letter shown on a board lot — matches property card corner letters from the physical board CSV. */
export function getPlotBoardLetter(
  plot: Plot,
  builtPropertyCard?: PropertyCard | null
): string | null {
  if (plot.type !== 'city' || !plot.building) return null

  if (builtPropertyCard && plot.claimedBy !== undefined) {
    if (builtPropertyCard.type === 'anchor') {
      return getAnchorCornerNotation(builtPropertyCard) ?? 'AT'
    }
    return getPropertyCornerLetter(builtPropertyCard)
  }

  if (plot.building === 'Union') return null

  return plot.lotCategory ?? null
}

export function isCivicPropertyCard(card: Pick<PropertyCard, 'id'>): boolean {
  return CIVIC_PROPERTY_IDS.has(card.id)
}

export function civicVariantIdForCivicCard(cardId: string): string {
  if (cardId === 'city-hall' || cardId === 'courthouse' || cardId === 'police') return cardId
  return 'civic-center'
}

/** Vacant civic lots on the board that match a civic variant id. */
export function plotsMatchingCivicVariant(plots: Plot[], variantId: string): Plot[] {
  return plots.filter(
    (p) =>
      p.type === 'city' &&
      p.lotCategory === 'C' &&
      !p.builtProperty &&
      p.civicVariantId === variantId
  )
}

function civicVariantPlaceable(
  plots: Plot[],
  variantId: string,
  _crossingTheLineActive: boolean
): boolean {
  // Civic flex has no district lock — any vacant C lot with this identity is legal.
  return plots.some((plot) => {
    if (plot.type !== 'city' || plot.builtProperty || plot.lotCategory !== 'C') return false
    if (plot.civicVariantId !== variantId) return false
    return true
  })
}

/**
 * Vacant civic (C) lots — Civic hand cards may build on any of these
 * (Hope Hospital, Firehouse 01, City Hall, Courthouse, Police, Public Works, etc.).
 */
export function getVacantCivicLots(plots: Plot[]): Plot[] {
  return plots.filter(
    (p) =>
      p.type === 'city' &&
      p.lotCategory === 'C' &&
      !p.builtProperty &&
      !!p.civicVariantId &&
      !!p.building
  )
}

/**
 * Civic flex picker: only variants with at least one vacant C lot on the board.
 * District filters do not apply — the Civic card has no City Center / Farmland / etc. subtitle.
 */
export function getAvailableCivicVariantIds(
  plots: Plot[],
  crossingTheLineActive: boolean
): string[] {
  return CIVIC_VARIANT_PROPERTY_IDS.filter((variantId) =>
    civicVariantPlaceable(plots, variantId, crossingTheLineActive)
  )
}

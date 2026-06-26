import { Plot } from './types'
import { PropertyCard } from './cardTypes'
import { getPlotDistricts } from './districts'
import {
  civicVariantIdForCivicCard,
  getCardLotLetter,
  isCivicPropertyCard,
} from './lotCategory'

/** Union anchor tenet lots only (C11, K3, S11, K19). */
const UNION_DESIGNATED_ANCHOR_COORDS = new Set(['K3', 'K19', 'C11', 'S11'])

/**
 * Center Anchor (AT) grid for Church Affiliation, Influencer, Mafia, News Outlet,
 * Regulation Bureau — and Anchor Wild Card when emulating one of those.
 */
const CENTER_ANCHOR_GRID_20 = new Set([
  'C3',
  'G3',
  'O3',
  'S3',
  'C7',
  'G7',
  'K7',
  'O7',
  'S7',
  'G11',
  'O11',
  'C15',
  'G15',
  'K15',
  'O15',
  'S15',
  'C19',
  'G19',
  'O19',
  'S19',
])

/** Tourism Office — Mountain Cove district AT cells. */
const TOURISM_OFFICE_ANCHOR_COORDS = new Set(['C3', 'G3', 'O3', 'S3'])

/** Arts Council — Riverfront district AT cells. */
const ARTS_COUNCIL_ANCHOR_COORDS = new Set(['C3', 'C7', 'C15', 'C19'])

/** Port Authority — Railway district AT cells. */
const PORT_AUTHORITY_ANCHOR_COORDS = new Set(['S3', 'S7', 'S15', 'S19'])

/** Farm Bureau — Farmland district AT cells. */
const FARM_COOP_ANCHOR_COORDS = new Set(['C19', 'G19', 'O19', 'S19'])

function plotCoordKey(plot: Plot): string {
  return `${plot.col}${plot.row}`
}

/** Vacant Anchor-cell coordinates allowed for a concrete anchor card id. */
function anchorBuildCoordsForCardId(cardId: string): Set<string> | null {
  switch (cardId) {
    case 'tourism-office':
      return TOURISM_OFFICE_ANCHOR_COORDS
    case 'arts-council':
      return ARTS_COUNCIL_ANCHOR_COORDS
    case 'port-authority':
      return PORT_AUTHORITY_ANCHOR_COORDS
    case 'farm-coop':
      return FARM_COOP_ANCHOR_COORDS
    case 'church':
    case 'media':
    case 'mafia':
    case 'news-outlet':
    case 'regulation-bureau':
      return CENTER_ANCHOR_GRID_20
    default:
      return null
  }
}

export function canPlaceProperty(
  card: PropertyCard,
  plot: Plot,
  plots: Plot[],
  crossingTheLineActive: boolean = false
): boolean {
  if (plot.type !== 'city') return false

  if (plot.builtProperty !== undefined) return false

  if (!plot.building) return false

  const buildingName = plot.building
  /** Legacy board labels: treat as renamed zoning types for matching buildLocations. */
  const zoningLabel =
    buildingName === 'Mixed'
      ? 'Commercial'
      : buildingName === 'Food'
        ? 'Dining'
        : buildingName

  if (card.type === 'anchor') {
    const key = plotCoordKey(plot)
    if (buildingName === 'Union') {
      return card.id === 'union' && UNION_DESIGNATED_ANCHOR_COORDS.has(key)
    }
    if (buildingName !== 'Anchor' && buildingName !== 'Anchor Tenet') {
      return false
    }
    const coords = anchorBuildCoordsForCardId(card.id)
    return coords !== null && coords.has(key)
  }

  if (card.type === 'property' && card.district && !crossingTheLineActive) {
    const onPlot = getPlotDistricts(plot.row, plot.col)
    if (!onPlot.includes(card.district)) {
      return false
    }
  }

  if (isCivicPropertyCard(card)) {
    if (plot.lotCategory !== 'C') return false
    const requiredVariant = civicVariantIdForCivicCard(card.id)
    if (plot.civicVariantId && plot.civicVariantId !== requiredVariant) return false
    return true
  }

  const cardLetter = getCardLotLetter(card)
  if (plot.lotCategory && cardLetter) {
    return plot.lotCategory === cardLetter
  }

  for (const allowedLocation of card.buildLocations) {
    if (
      zoningLabel.toLowerCase().includes(allowedLocation.toLowerCase()) ||
      allowedLocation.toLowerCase().includes(zoningLabel.toLowerCase())
    ) {
      return true
    }
  }

  return false
}

export function getValidPlotsForProperty(
  card: PropertyCard,
  plots: Plot[],
  crossingTheLineActive: boolean = false
): Plot[] {
  return plots.filter((plot) => canPlaceProperty(card, plot, plots, crossingTheLineActive))
}

/** Vacant city lots where a Rezoning build may be attempted (ignores normal zoning / district match). */
export function getVacantCityLotsForRezoning(plots: Plot[]): Plot[] {
  return plots.filter(
    (plot) =>
      plot.type === 'city' &&
      plot.building !== undefined &&
      plot.building !== '' &&
      (plot.builtProperty === undefined || plot.builtProperty === '')
  )
}

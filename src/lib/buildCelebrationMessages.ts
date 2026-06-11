import type { PropertyCard } from './cardTypes'

const CIVIC_LAW_NAMES = new Set(['City Hall', 'Civic Center', 'Courthouse', 'Police'])

/** Cultural line: museum-lot Arts & Entertainment cards keep the museum celebration. */
const MUSEUM_STYLE_IDS = ['museum-']

export type BuildCelebrationOpts = {
  housingHighDensity?: boolean
}

/**
 * Returns the centered board banner line for a standard property or anchor build, or null to use a generic fallback.
 */
export function getBuildCelebrationMessage(
  card: PropertyCard,
  opts: BuildCelebrationOpts = {}
): string | null {
  const high = opts.housingHighDensity === true

  if (card.name === 'Housing') {
    return high ? 'High density housing developed!' : 'Housing developed!'
  }

  if (CIVIC_LAW_NAMES.has(card.name)) {
    return 'City laws established to be enforced!'
  }

  if (MUSEUM_STYLE_IDS.some((prefix) => card.id.startsWith(prefix))) {
    return 'Museum built to add to surrounding area!'
  }

  switch (card.name) {
    case 'Church Affiliation':
      return 'Church affiliation created!'
    case 'Farm Bureau':
      return 'Farm Bureau formed!'
    case 'Port Authority':
      return 'Port Authority engineered!'
    case 'Arts Council':
      return 'Arts Council crafted!'
    case 'Tourism Office':
      return 'Tourism office conceived!'
    case 'Influencer':
      return 'Social media influencer launched!'
    case 'Mafia':
      return 'Mafia infiltrated!'
    case 'News Outlet':
      return 'News Outlet originated!'
    case 'Regulation Bureau':
      return 'Regulation Bureau established!'
    case 'Hotel':
      return 'Hotel constructed!'
    case 'Park':
      return 'City block beautified!'
    case 'Commercial':
      return 'Shops and offices fashioned!'
    case 'Industry':
      return 'Industry founded to strengthen infrastructure!'
    case 'Freight':
      return 'Freight and distribution organized!'
    case 'Storage':
      return 'Extra space established!'
    case 'Power':
      return 'Power grid engineered!'
    case 'Food':
      return 'Food access coordinated!'
    case 'Arts':
      return 'Entertainment established!'
    default:
      return null
  }
}

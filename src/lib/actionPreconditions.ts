import { propertyCards } from './cardData'
import type { PropertyCard } from './cardTypes'
import type { Plot } from './types'

/** Any built lot whose card is an anchor tenant (includes Mafia, Influencer, etc.). */
export function boardHasBuiltAnchorTenant(plots: Plot[]): boolean {
  return plots.some((p) => {
    if (!p.builtProperty) return false
    const c = propertyCards.find((x) => x.id === p.builtProperty) as PropertyCard | undefined
    return c?.type === 'anchor'
  })
}

/** Police Raid on Mafia requires a built Mafia lot on the board. */
export function boardHasBuiltMafia(plots: Plot[]): boolean {
  return plots.some((p) => p.builtProperty === 'mafia')
}

import type { PropertyCard } from './cardTypes'
import { propertyCards } from './cardData'

/** Built `plot.builtProperty` id when the player chose Civic Center at play time. */
export function isCivicFlexHandCard(card: PropertyCard): boolean {
  if (card.category !== 'civic' || card.type !== 'property') return false
  return (
    card.id.startsWith('civic-') ||
    card.id === 'city-hall' ||
    card.id === 'courthouse' ||
    card.id === 'police'
  )
}

export function getPropertyHandDisplayName(card: PropertyCard): string {
  return isCivicFlexHandCard(card) ? 'Civic' : card.name
}

export function getCivicVariantPropertyCard(variantId: string): PropertyCard | undefined {
  return propertyCards.find((c) => c.id === variantId) as PropertyCard | undefined
}

export function getCivicVariantShortRule(variantId: string, plots?: import('./types').Plot[]): string {
  const lotNames =
    plots
      ?.filter(
        (p) =>
          p.type === 'city' &&
          p.lotCategory === 'C' &&
          !p.builtProperty &&
          p.civicVariantId === variantId &&
          p.building
      )
      .map((p) => p.building as string) ?? []

  const lotsHint = lotNames.length > 0 ? ` Vacant C lots: ${lotNames.join(', ')}.` : ''

  switch (variantId) {
    case 'city-hall':
      return `Board-wide influence (City Council Freeze, Police Raid, etc.).${lotsHint}`
    case 'courthouse':
      return `Board-wide influence (City Council Freeze, Police Raid, etc.).${lotsHint}`
    case 'police':
      return `Board-wide influence (Police Raid, City Council Freeze, etc.).${lotsHint}`
    case 'civic-center':
      return `Influence only on the city block where built.${lotsHint}`
    default:
      return ''
  }
}

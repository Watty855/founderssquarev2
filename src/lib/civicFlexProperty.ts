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

export function getCivicVariantShortRule(variantId: string): string {
  switch (variantId) {
    case 'city-hall':
      return 'Board-wide influence (City Council Freeze, Police Raid, etc.). Build on City Hall lots.'
    case 'courthouse':
      return 'Board-wide influence (City Council Freeze, Police Raid, etc.). Build on Courthouse lots.'
    case 'police':
      return 'Board-wide influence (Police Raid, City Council Freeze, etc.). Build on Police lots.'
    case 'civic-center':
      return 'Influence only on the city block where built. Build on Civic / Civic Center lots.'
    default:
      return ''
  }
}

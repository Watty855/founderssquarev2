import { propertyCards, ANCHOR_WILD_CARD_EMULATE_IDS, CIVIC_VARIANT_PROPERTY_IDS } from './cardData'
import type { PropertyCard } from './cardTypes'
import { isCivicFlexHandCard } from './civicFlexProperty'

/** Resolve placement rules and builtProperty id from hand card + optional emulate id (anchor wild / civic flex). */
export function resolvePropertyPlacementTemplate(
  handCard: PropertyCard,
  emulatePropertyId?: string | null
): PropertyCard | undefined {
  if (handCard.id === 'anchor-wild-card') {
    if (!emulatePropertyId) return undefined
    if (!(ANCHOR_WILD_CARD_EMULATE_IDS as readonly string[]).includes(emulatePropertyId)) return undefined
    return propertyCards.find((c) => c.id === emulatePropertyId) as PropertyCard | undefined
  }
  if (isCivicFlexHandCard(handCard)) {
    if (!emulatePropertyId) return undefined
    if (!(CIVIC_VARIANT_PROPERTY_IDS as readonly string[]).includes(emulatePropertyId)) return undefined
    return propertyCards.find((c) => c.id === emulatePropertyId) as PropertyCard | undefined
  }
  return handCard
}

export function needsEmulateChoiceBeforePlacement(handCard: PropertyCard): boolean {
  return handCard.id === 'anchor-wild-card' || isCivicFlexHandCard(handCard)
}

import { ACTION_WILD_CARD_ID, actionCards } from './cardData'
import type { ActionCard } from './cardTypes'

export { ACTION_WILD_CARD_ID }

export function isActionWildCard(cardId: string | undefined | null): boolean {
  return cardId === ACTION_WILD_CARD_ID
}

/** Hand-playable actions the Action Wild Card may copy. Calamity is deck-triggered, not a hand play. */
export function getActionWildEmulateCards(): ActionCard[] {
  return actionCards.filter((c) => c.id !== ACTION_WILD_CARD_ID && c.category !== 'calamity')
}

export function isValidActionWildEmulateId(id: string | undefined | null): id is string {
  if (!id) return false
  return getActionWildEmulateCards().some((c) => c.id === id)
}

export function resolveActionPlayId(cardId: string, emulateActionId?: string | null): string {
  if (cardId !== ACTION_WILD_CARD_ID) return cardId
  return emulateActionId && isValidActionWildEmulateId(emulateActionId) ? emulateActionId : cardId
}

/** Effective action id for a hand instance (Action Wild Card copies `emulateActionId`). */
export function playedActionId(
  cardId: string | undefined | null,
  emulateActionId?: string | null
): string | undefined {
  if (!cardId) return undefined
  return resolveActionPlayId(cardId, emulateActionId)
}

import { actionCards, propertyCards } from './cardData'
import { CardInstance } from './cardTypes'

export function createActionDeck(): CardInstance[] {
  const deck: CardInstance[] = []
  let cardNumber = 1
  
  actionCards.forEach(card => {
    for (let i = 0; i < card.copies; i++) {
      deck.push({
        cardId: card.id,
        instanceId: `${card.id}-${i + 1}`,
        cardNumber: cardNumber++
      })
    }
  })
  
  return shuffleDeck(deck)
}

export function createPropertyDeck(): CardInstance[] {
  const deck: CardInstance[] = []
  let cardNumber = 1
  
  propertyCards.forEach(card => {
    for (let i = 0; i < card.copies; i++) {
      deck.push({
        cardId: card.id,
        instanceId: `${card.id}-${i + 1}`,
        cardNumber: cardNumber++
      })
    }
  })
  
  return shuffleDeck(deck)
}

export function shuffleDeck<T>(deck: T[]): T[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function drawCards<T>(deck: T[], count: number): { drawn: T[], remaining: T[] } {
  const drawn = deck.slice(0, count)
  const remaining = deck.slice(count)
  return { drawn, remaining }
}

/**
 * Draw up to `count` from `deck`; when empty, reshuffle **all** cards from `discard` into a fresh deck (then continue).
 *
 * Call pattern: intended for **action** draws — property replacement draws from **`propertyDeck` via `drawCards` only**, without reshuffling `propertyDiscard`, unless rules change later.
 *
 * Pass deck/discard **before** pushing cards discarded in the same resolution so those cards cannot be redrawn immediately in that step.
 */
export function drawFromDeckWithDiscardReshuffle(
  deck: CardInstance[],
  discard: CardInstance[],
  count: number
): { drawn: CardInstance[]; deck: CardInstance[]; discard: CardInstance[] } {
  let d = [...deck]
  let disc = [...discard]
  const drawn: CardInstance[] = []
  while (drawn.length < count) {
    if (d.length === 0) {
      if (disc.length === 0) break
      d = shuffleDeck(disc)
      disc = []
    }
    const take = Math.min(count - drawn.length, d.length)
    const { drawn: batch, remaining } = drawCards(d, take)
    drawn.push(...batch)
    d = remaining
  }
  return { drawn, deck: d, discard: disc }
}

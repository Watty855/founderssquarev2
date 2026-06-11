import type { PropertyCard } from './cardTypes'

/**
 * Face-card style corner letters shown top-left / top-right on property cards:
 * C civic · A arts/museum/tourism/fairgrounds · T hotel · P park · Co commercial ·
 * H housing · I industry/mining · D freight/distribution · S storage/warehouse ·
 * F food/grocery · O fuel/power.
 */
const NAME_TO_LETTER: Record<string, string> = {
  Civic: 'C',
  'Civic Center': 'C',
  'City Hall': 'C',
  Courthouse: 'C',
  Police: 'C',
  'Arts & Entertainment': 'A',
  Museum: 'A',
  Tourism: 'A',
  Hotel: 'T',
  Park: 'P',
  Commercial: 'Co',
  Housing: 'H',
  'Industry & Mining': 'I',
  Industry: 'I',
  Mining: 'I',
  Freight: 'D',
  Storage: 'S',
  'Food & Grocery': 'F',
  Grocery: 'F',
  Dining: 'F',
  Power: 'O',
}

export function getPropertyCornerLetter(card: Pick<PropertyCard, 'name' | 'type'>): string | null {
  if (card.type === 'anchor') return null
  return NAME_TO_LETTER[card.name] ?? null
}

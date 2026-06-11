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
  Arts: 'A',
  Museum: 'A',
  Tourism: 'A',
  Hotel: 'T',
  Park: 'P',
  Commercial: 'Co',
  Housing: 'H',
  Industry: 'I',
  Mining: 'I',
  Freight: 'D',
  Storage: 'S',
  Food: 'F',
  Grocery: 'F',
  Dining: 'F',
  Power: 'O',
}

export function getPropertyCornerLetter(card: Pick<PropertyCard, 'name' | 'type'>): string | null {
  if (card.type === 'anchor') return null
  return NAME_TO_LETTER[card.name] ?? null
}

/**
 * Anchor tenet notations shown on all four corners (face-card style):
 * CAT church affiliation · WAT anchor wild card · FAT farm bureau · PAT port authority ·
 * AAT arts council · IAT influencer · TAT tourism office · MAT mafia · NAT news outlet ·
 * RAT regulation bureau · UAT union.
 */
const ANCHOR_NAME_TO_NOTATION: Record<string, string> = {
  'Church Affiliation': 'CAT',
  'Anchor Wild Card': 'WAT',
  'Farm Bureau': 'FAT',
  'Port Authority': 'PAT',
  'Arts Council': 'AAT',
  Influencer: 'IAT',
  'Tourism Office': 'TAT',
  Mafia: 'MAT',
  'News Outlet': 'NAT',
  'Regulation Bureau': 'RAT',
  Union: 'UAT',
}

export function getAnchorCornerNotation(card: Pick<PropertyCard, 'name' | 'type'>): string | null {
  if (card.type !== 'anchor') return null
  return ANCHOR_NAME_TO_NOTATION[card.name] ?? null
}

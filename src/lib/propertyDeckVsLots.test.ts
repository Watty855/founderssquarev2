import { describe, expect, it } from 'vitest'
import { lotCategoryData } from '@/lib/boardLotData'
import { propertyCards } from '@/lib/cardData'
import { DISTRICTS, getPlotDistricts, type District } from '@/lib/districts'
import { getCardLotLetter, type LotCategoryLetter } from '@/lib/lotCategory'

const DISTRICT_PROPERTY_LETTERS: LotCategoryLetter[] = [
  'H',
  'M',
  'F',
  'T',
  'P',
  'I',
  'D',
  'S',
  'O',
  'E',
]

function parseKey(key: string): { col: string; row: number } {
  const m = key.match(/^([A-Z]+)(\d+)$/)
  if (!m) throw new Error(`Bad lot key ${key}`)
  return { col: m[1]!, row: Number(m[2]) }
}

function emptyDistrictLetterCounts(): Record<District, Record<LotCategoryLetter, number>> {
  const out = {} as Record<District, Record<LotCategoryLetter, number>>
  for (const d of DISTRICTS) {
    out[d.name] = Object.fromEntries(DISTRICT_PROPERTY_LETTERS.map((l) => [l, 0])) as Record<
      LotCategoryLetter,
      number
    >
  }
  return out
}

describe('property deck vs lots', () => {
  it('matches one district property card per lot of that letter in each district', () => {
    const lots = emptyDistrictLetterCounts()
    let civicLots = 0

    for (const [key, letter] of Object.entries(lotCategoryData)) {
      if (letter === 'AT') continue
      if (letter === 'C') {
        civicLots += 1
        continue
      }
      const { col, row } = parseKey(key)
      for (const district of getPlotDistricts(row, col)) {
        lots[district][letter] += 1
      }
    }

    const cards = emptyDistrictLetterCounts()
    let civicCards = 0

    for (const card of propertyCards) {
      if (card.type === 'anchor') continue
      const letter = getCardLotLetter(card)
      if (!letter) continue
      if (letter === 'C' || card.category === 'civic') {
        civicCards += card.copies
        continue
      }
      if (!card.district) {
        throw new Error(`District property card ${card.id} is missing district`)
      }
      cards[card.district][letter] += card.copies
    }

    for (const d of DISTRICTS) {
      for (const letter of DISTRICT_PROPERTY_LETTERS) {
        expect(cards[d.name][letter], `${d.name} ${letter}`).toBe(lots[d.name][letter])
      }
    }
    expect(civicCards, 'civic cards vs C lots').toBe(civicLots)
  })
})

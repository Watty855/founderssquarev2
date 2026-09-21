#!/usr/bin/env node
/**
 * Generates src/lib/boardLotData.ts from the board-design CSV (scripts/board-source.csv).
 *
 * CSV coordinates → engine coordinates:
 *   - CSV data row r (first row after the "Table 2-1" header) → engine row r + 1
 *     (engine rows 1 and 21 are the north/south bleed bands).
 *   - CSV field i (1-based) → engine column letter(i + 1): spreadsheet column A → engine B
 *     (engine columns A and U are the west/east bleed bands).
 *   - Static streets: spreadsheet columns D/H/L/P → engine E/I/M/Q; rows 5/9/13/17 both.
 *   - Church court: spreadsheet I10–K12 → engine J10–L12 (cathedral K11).
 *
 * Usage: node scripts/genBoardLotData.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const csvPath = join(here, 'board-source.csv')
const outPath = join(here, '..', 'src', 'lib', 'boardLotData.ts')

const STREET_FIELD_IDX = new Set([4, 8, 12, 16]) // 1-based CSV fields → engine cols E, I, M, Q
const STREET_DATA_ROWS = new Set([4, 8, 12, 16]) // 1-based CSV data rows → engine rows 5, 9, 13, 17
const CHURCH_FIELDS = new Set([9, 10, 11]) // engine cols J, K, L
const CHURCH_DATA_ROWS = new Set([9, 10, 11]) // engine rows 10, 11, 12

const VALID_LETTERS = new Set(['C', 'A', 'T', 'P', 'M', 'H', 'I', 'D', 'S', 'F', 'O', 'E', 'AT'])

/** Simple CSV split (source has no quoted commas). */
function splitCsvLine(line) {
  return line.split(',')
}

/** "Paper Mill (I)" → { name: "Paper Mill", letter: "I" }; handles inline "(T)" and typos. */
function parseCell(raw) {
  let text = raw.replace(/\u00a0/g, ' ').trim()
  if (!text || text === '[]' || text === 'Street' || text === 'Church') return null
  // Letter marker anywhere in the string, e.g. "High (T) Mountain".
  const m = text.match(/\(([A-Z]{1,2})\)/)
  let letter = m ? m[1] : null
  if (letter === 'II') letter = 'I' // "Taylor Boats (II)" typo
  const name = text
    .replace(/\s*\([A-Z]{1,2}\)\s*/, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (letter && !VALID_LETTERS.has(letter)) {
    throw new Error(`Unknown lot letter "${letter}" in cell "${raw}"`)
  }
  return { name, letter }
}

function civicVariantForName(name) {
  if (name === 'City Hall') return 'city-hall'
  if (name === 'Courthouse') return 'courthouse'
  if (name === 'Police') return 'police'
  return 'civic-center'
}

const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0)
// First line is the sheet title ("Table 2-1,,,…").
const dataLines = lines.slice(1)
if (dataLines.length !== 19) {
  throw new Error(`Expected 19 board rows, found ${dataLines.length}`)
}

const buildingEntries = []
const categoryEntries = []
const civicEntries = []
const skipped = []

for (let r = 1; r <= 19; r++) {
  const fields = splitCsvLine(dataLines[r - 1])
  for (let i = 1; i <= 19; i++) {
    const raw = fields[i - 1] ?? ''
    const engineRow = r + 1
    const engineCol = String.fromCharCode(65 + i) // field 1 → B … field 19 → T
    const key = `${engineCol}${engineRow}`
    const isStreetCell = STREET_FIELD_IDX.has(i) || STREET_DATA_ROWS.has(r)
    const isChurchCell = CHURCH_FIELDS.has(i) && CHURCH_DATA_ROWS.has(r)

    const parsed = parseCell(raw)
    if (!parsed) continue

    if (isStreetCell || isChurchCell) {
      // e.g. the stray "B Bank (M)" printed on a street row in the source sheet.
      skipped.push(`${key} "${raw.trim()}" (${isStreetCell ? 'street' : 'church'} cell)`)
      continue
    }

    buildingEntries.push([key, parsed.name])
    if (parsed.letter) categoryEntries.push([key, parsed.letter])
    if (parsed.letter === 'C') civicEntries.push([key, civicVariantForName(parsed.name)])
  }
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const out = `import type { LotCategoryLetter } from './lotCategory'

/**
 * GENERATED from scripts/board-source.csv by scripts/genBoardLotData.mjs — do not hand-edit.
 * Board-design (spreadsheet) coordinates are offset one column from engine coordinates:
 * spreadsheet A5 = engine B5. Engine row 1/21 and columns A/U are the bleed bands.
 */
export const buildingData: Record<string, string> = {
${buildingEntries.map(([k, v]) => `  '${k}': '${esc(v)}',`).join('\n')}
}

export const lotCategoryData: Record<string, LotCategoryLetter> = {
${categoryEntries.map(([k, v]) => `  '${k}': '${v}',`).join('\n')}
}

export const civicVariantByCell: Record<string, 'city-hall' | 'courthouse' | 'police' | 'civic-center'> = {
${civicEntries.map(([k, v]) => `  '${k}': '${v}',`).join('\n')}
}
`

writeFileSync(outPath, out)
console.log(`Wrote ${buildingEntries.length} lots, ${categoryEntries.length} letters, ${civicEntries.length} civic cells → ${outPath}`)
if (skipped.length > 0) {
  console.log('Skipped cells (printed on static geometry in the source sheet):')
  for (const s of skipped) console.log(`  - ${s}`)
}

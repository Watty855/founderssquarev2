import { Plot } from './types'
import { buildingData, civicVariantByCell, lotCategoryData } from './boardLotData'

export const createInitialBoard = (): Plot[] => {
  const plots: Plot[] = []

  // Church area: empty city plots around the cathedral
  const churchEmptyCells = new Set(['J10', 'K10', 'L10', 'J11', 'L11', 'J12', 'K12', 'L12'])

  const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']
  const STREET_ROWS = [5, 9, 13, 17]
  const STREET_COLS = ['E', 'I', 'M', 'Q']

  for (let row = 1; row <= 21; row++) {
    for (const col of COLUMNS) {
      const key = `${col}${row}`
      const colIndex = COLUMNS.indexOf(col)

      // Row 1: Mountain border
      if (row === 1) {
        plots.push({ row, col, type: 'border', building: 'Mountain' })
      }
      // Row 21: Farmland border
      else if (row === 21) {
        plots.push({ row, col, type: 'border', building: 'Farmland' })
      }
      // Column A: River border
      else if (col === 'A') {
        plots.push({ row, col, type: 'border', building: 'River' })
      }
      // Column U: Railway border
      else if (col === 'U') {
        plots.push({ row, col, type: 'border', building: 'Railway' })
      }
      // K11: Cathedral (Church)
      else if (key === 'K11') {
        plots.push({ row, col, type: 'cathedral', building: 'Church' })
      }
      // Empty cells around the church
      else if (churchEmptyCells.has(key)) {
        plots.push({ row, col, type: 'city' })
      }
      // Street rows (5, 9, 13, 17) - interior cells only
      else if (STREET_ROWS.includes(row) && colIndex >= 1 && colIndex <= 19) {
        plots.push({ row, col, type: 'street', building: 'Street' })
      }
      // Street columns (E, I, M, Q) - interior cells only
      else if (STREET_COLS.includes(col) && row >= 2 && row <= 20) {
        plots.push({ row, col, type: 'street', building: 'Street' })
      }
      // Named buildings
      else if (buildingData[key]) {
        const building = buildingData[key]
        const plot: Plot = { row, col, type: 'city', building }
        const lotCategory = lotCategoryData[key]
        if (lotCategory) plot.lotCategory = lotCategory
        const civicVariantId = civicVariantByCell[key]
        if (civicVariantId) plot.civicVariantId = civicVariantId
        if (lotCategory === 'AT' || building === 'Anchor Tenet' || building === 'Anchor') {
          plot.isAnchor = true
        }
        plots.push(plot)
      }
      // Remaining interior cells: empty city plots
      else {
        plots.push({ row, col, type: 'city' })
      }
    }
  }

  return plots
}

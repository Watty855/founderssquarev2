import { Plot } from './types'

export const createInitialBoard = (): Plot[] => {
  const plots: Plot[] = []

  const buildingData: Record<string, string> = {
    // Row 2
    'B2': 'Quarry Dock', 'C2': 'Granite Quarry', 'D2': 'Hotel',
    'F2': 'Materials Yard', 'G2': 'Gravel Pit', 'H2': 'Dining',
    'J2': 'Summit Hotel', 'K2': 'Market', 'L2': 'Highland Lodge',
    'N2': 'Tourism', 'O2': 'Silver Mine', 'P2': 'Fuel',
    'R2': 'Copper Mine', 'S2': 'Equip Service', 'T2': 'Timber Yard',

    // Row 3
    'B3': 'Industry', 'C3': 'Anchor', 'D3': 'Housing',
    'F3': 'Distribution', 'G3': 'Anchor', 'H3': 'Hotel',
    'J3': 'Tourism', 'K3': 'Union', 'L3': 'Tourism',
    'N3': 'Hotel', 'O3': 'Anchor', 'P3': 'Materials Yard',
    'R3': 'Housing', 'S3': 'Anchor', 'T3': 'Distribution',

    // Row 4
    'B4': 'Power Plant', 'C4': 'Commercial', 'D4': 'Dining',
    'F4': 'Grocery', 'G4': 'Housing', 'H4': 'Tourism',
    'J4': 'Commercial', 'K4': 'Park', 'L4': 'Housing',
    'N4': 'Grocery', 'O4': 'Housing', 'P4': 'Distribution',
    'R4': 'Dining', 'S4': 'Grocery', 'T4': 'Train Terminal',

    // Row 6
    'B6': 'Housing', 'C6': 'Industry', 'D6': 'Storage',
    'F6': 'Civic', 'G6': 'Hotel', 'H6': 'Housing',
    'J6': 'Housing', 'K6': 'Grocery', 'L6': 'Housing',
    'N6': 'Housing', 'O6': 'Hotel', 'P6': 'Civic',
    'R6': 'Hotel', 'S6': 'Distribution', 'T6': 'Materials Yard',

    // Row 7
    'B7': 'Marina', 'C7': 'Anchor', 'D7': 'Distribution',
    'F7': 'Park', 'G7': 'Anchor', 'H7': 'Commercial',
    'J7': 'Housing', 'K7': 'Anchor', 'L7': 'Housing',
    'N7': 'Commercial', 'O7': 'Anchor', 'P7': 'Park',
    'R7': 'Housing', 'S7': 'Anchor', 'T7': 'Industry',

    // Row 8
    'B8': 'Housing', 'C8': 'Commercial', 'D8': 'Grocery',
    'F8': 'Housing', 'G8': 'Housing', 'H8': 'Dining',
    'J8': 'Commercial', 'K8': 'City Hall', 'L8': 'Hotel',
    'N8': 'Dining', 'O8': 'Tourism', 'P8': 'Housing',
    'R8': 'Grocery', 'S8': 'Commercial', 'T8': 'Distribution',

    // Row 10
    'B10': 'Tourism', 'C10': 'Housing', 'D10': 'Commercial',
    'F10': 'Housing', 'G10': 'Housing', 'H10': 'Commercial',
    'N10': 'Police', 'O10': 'Housing', 'P10': 'Housing',
    'R10': 'Hotel', 'S10': 'Warehouse', 'T10': 'Industry',

    // Row 11
    'B11': 'Fish Market', 'C11': 'Union', 'D11': 'Park',
    'F11': 'Grocery', 'G11': 'Anchor', 'H11': 'Park',
    'K11': 'Church',
    'N11': 'Park', 'O11': 'Anchor', 'P11': 'Grocery',
    'R11': 'Commercial', 'S11': 'Union', 'T11': 'Train Terminal',

    // Row 12
    'B12': 'Riverfront Hotel', 'C12': 'Housing', 'D12': 'Dining',
    'F12': 'Housing', 'G12': 'Housing', 'H12': 'Courthouse',
    'N12': 'The Grand Hotel', 'O12': 'Housing', 'P12': 'Housing',
    'R12': 'Dining', 'S12': 'Storage', 'T12': 'Industry',

    // Row 14
    'B14': 'Housing', 'C14': 'Tourism', 'D14': 'Hotel',
    'F14': 'Housing', 'G14': 'Housing', 'H14': 'Dining',
    'J14': 'Memorial Hotel', 'K14': 'Civic Center', 'L14': 'History Museum',
    'N14': 'Tourism', 'O14': 'Dining', 'P14': 'Housing',
    'R14': 'Grocery', 'S14': 'Hotel', 'T14': 'Fuel',

    // Row 15
    'B15': 'Marina', 'C15': 'Anchor', 'D15': 'Dining',
    'F15': 'Park', 'G15': 'Anchor', 'H15': 'Commercial',
    'J15': 'Housing', 'K15': 'Anchor', 'L15': 'Housing',
    'N15': 'Commercial', 'O15': 'Anchor', 'P15': 'Park',
    'R15': 'Housing', 'S15': 'Anchor', 'T15': 'Industry',

    // Row 16
    'B16': 'Housing', 'C16': 'Commercial', 'D16': 'Civic Center',
    'F16': 'Hotel', 'G16': 'Grocery', 'H16': 'Housing',
    'J16': 'Housing', 'K16': 'Grocery', 'L16': 'Housing',
    'N16': 'Housing', 'O16': 'Housing', 'P16': 'Grocery',
    'R16': 'Civic Center', 'S16': 'Commercial', 'T16': 'Distribution',

    // Row 18
    'B18': 'River Arts Museum', 'C18': 'Hotel', 'D18': 'Dining',
    'F18': 'Housing', 'G18': 'Fairgrounds', 'H18': 'Dining',
    'J18': 'Hotel', 'K18': 'Park', 'L18': 'Cowboy Hotel',
    'N18': 'Fuel', 'O18': 'Trade Market', 'P18': 'Hotel',
    'R18': 'Housing', 'S18': 'Dining', 'T18': 'Train Terminal',

    // Row 19
    'B19': 'Harbor Warehouse', 'C19': 'Anchor', 'D19': 'Distribution',
    'F19': 'Distribution', 'G19': 'Anchor', 'H19': 'Dairy Co-op',
    'J19': 'Distribution', 'K19': 'Union', 'L19': 'Distribution',
    'N19': 'Commercial', 'O19': 'Anchor', 'P19': 'Distribution',
    'R19': 'Grocery', 'S19': 'Anchor', 'T19': 'Warehouse',

    // Row 20
    'B20': 'Founders Mill', 'C20': 'Warehouse', 'D20': 'Fuel',
    'F20': 'Farm Processing', 'G20': 'Storage', 'H20': 'Commercial',
    'J20': 'Farm Processing', 'K20': 'Farmers Market', 'L20': 'Farm Processing',
    'N20': 'Industry', 'O20': 'Grain Silo', 'P20': 'Storage',
    'R20': 'Farm Processing', 'S20': 'Storage', 'T20': 'Founders Mill',
  }

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
        const isAnchor = building === 'Anchor'
        const plot: Plot = { row, col, type: 'city', building }
        if (isAnchor) {
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

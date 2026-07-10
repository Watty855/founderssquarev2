import { CardInstance } from './cardTypes'

export interface Player {
  id: number
  name: string
  color: string
  actionCards: CardInstance[]
  propertyCards: CardInstance[]
  money: number
  /** PartyKit websocket id when this seat is a remote human — used for hand rail + relayed turns. */
  partySeatConnectionId?: string | null
  /** AI-controlled seat (turn prompts can be automated later). */
  isAi?: boolean
  aiDifficulty?: 'easy' | 'normal' | 'hard'
  /** Online view: hand sizes for other founders when their cards are redacted on this device. */
  peerHandCounts?: { actions: number; properties: number }
}

import type { LotCategoryLetter } from './lotCategory'

export type CivicVariantId = 'city-hall' | 'courthouse' | 'police' | 'civic-center'

export interface Plot {
  row: number
  col: string
  type: 'city' | 'street' | 'cathedral' | 'border'
  building?: string
  /** Board zoning letter from the physical lot label, e.g. M commercial, D distribution, C civic. */
  lotCategory?: LotCategoryLetter
  /** Which civic building model this C lot accepts (Hope Hospital, City Hall, etc.). */
  civicVariantId?: CivicVariantId
  claimedBy?: number
  builtProperty?: string
  /** Housing built as high-density (5+ stories): higher cost/income/end value; −1 takeover influence per such lot on the district. */
  housingHighDensity?: boolean
  /** Successful Scandal: this built anchor no longer grants anchor influence / block income bonuses. */
  anchorInfluenceSuppressed?: boolean
  isAnchor?: boolean
  /** Investors who placed Investment / Double Investment on this built lot (stripe color = investor). */
  investmentStripes?: Array<{ investorId: number; contributionMillion: number }>
}

export interface GameState {
  players: Player[]
  plots: Plot[]
  currentPlayerIndex: number
  isSetupComplete: boolean
  actionDeck: CardInstance[]
  propertyDeck: CardInstance[]
  actionDiscard: CardInstance[]
  propertyDiscard: CardInstance[]
  propertiesBuiltThisTurn: number
  actionsPlayedThisTurn: number
  /** Builds, banks, and resolved action plays each consume one slot (max 3 per turn). */
  turnActionsConsumed: number
  /** Set when the current founder finishes the Income dialog (roll or bank); blocks another Income play until end of turn. */
  incomeResolvedThisTurn?: boolean
  crossingTheLineActive: boolean
  playedPropertyCardThisTurn?: string
  newCardsDrawn?: CardInstance[]
  showNewCardsAnimation?: boolean
  gameEnded?: boolean
  winningSequence?: Array<{ row: number; col: string }>
  /** Set when the 9-sequential trigger fires. The triggerer's current turn finishes, then every
   *  founder (incl. triggerer) gets exactly one final turn before the game ends. */
  endGameTriggered?: boolean
  /** Founder id whose build/rezoning move triggered the final round (used for the banner). */
  endGameTriggerPlayerId?: number
  /** Coordinate of the qualifying 9-sequential placement that triggered the end (for highlight). */
  endGameTriggerLocation?: { row: number; col: string }
  /** Snapshot before the current founder's last turn-consuming action (build or action card). */
  undoLastAction?: import('./undoLastAction').UndoLastAction
  /** Counts down through the final round. Initialised to `players.length + 1` when the trigger
   *  fires (the +1 absorbs the triggerer's current turn end). Each `handleEndTurn` decrements;
   *  reaching 0 commits `gameEnded = true`. */
  finalRoundTurnsRemaining?: number
  lastBuiltProperty?: {
    row: number
    col: string
    propertyId: string
    buildCost: number
    /** Undo dialog: Anchor Wild Card builds show emulated anchor in the title. */
    undoTitle?: string
  }
  /** When set, this player cannot build properties until they finish their next turn (City Council Freeze). */
  councilFreezeBlockBuildForPlayerId?: number
  /**
   * Online games: a City Council Freeze attack succeeded and the target must roll to negate.
   * The device controlling the target seat (or the host, for a bot) opens the defense
   * dice dialog; every other device shows a waiting banner until the roll resolves.
   */
  pendingCouncilFreezeDefense?: {
    targetPlayerId: number
    attackerPlayerId: number
    attackerName: string
    targetName: string
  }
  /**
   * Online games: a PvP action succeeded and the target must roll to counter.
   * Scandal, hostile takeover, and police raid use this handoff so the defender's
   * device (or host for a bot) opens the dice dialog.
   */
  pendingRebuttalRoll?: {
    kind: 'scandal' | 'hostile-takeover' | 'police-raid'
    targetPlayerId: number
    attackerPlayerId: number
    attackerName: string
    targetName: string
    actionInstanceId: string
    scandalContext?: {
      row: number
      col: string
      anchorCardId: string
      anchorOwnerPlayerId: number
    }
    takeoverContext?: {
      row: number
      col: string
      ownerPlayerId: number
      payment120Million: number
    }
    policeRaidInfluenceBonus?: number
    policeRaidInfluenceLabels?: string[]
  }
  /**
   * Player ids who must take a city income tax on their next Income card resolution:
   * they keep max(0, collected − floor(property income total × 50%)); flag clears after that resolution.
   * The founder who played Taxation is never added here.
   */
  pendingIncomeTaxPlayerIds?: number[]
  /** After lobby setup, false until the player finishes the opening narration; omitted in older saves (treated as done). */
  openingNarrationComplete?: boolean
  /** Full table round: increments when turn passes from the last founder back to the first. */
  playRoundNumber?: number
}

export interface SquareBonusEntry {
  /** "[Player Name] Square" — the named, fully-owned 3×3 city block. */
  name: string
  bonusMillion: number
  bounds: { minRow: number; maxRow: number; minCol: string; maxCol: string }
  lots: Array<{ row: number; col: string }>
}

export interface StreetBonusEntry {
  /** "[Player Name] Street" — the named 6-lot, two-block, non-anchor-axis run. */
  name: string
  bonusMillion: number
  orientation: 'horizontal' | 'vertical'
  lots: Array<{ row: number; col: string }>
  /** Connecting street segment between the two blocks (for highlight + label placement). */
  streetSegment: Array<{ row: number; col: string }>
}

export interface PlayerScore {
  player: Player
  cashInHand: number
  propertyValue: number
  /** Sum of all square + street $30M bonuses earned by this founder. */
  bonusMillion: number
  squareBonuses: SquareBonusEntry[]
  streetBonuses: StreetBonusEntry[]
  totalScore: number
  propertiesOwned: number
}

export const PLAYER_COLORS = [
  { name: 'Crimson', value: 'oklch(0.60 0.24 20)' },
  { name: 'Azure', value: 'oklch(0.60 0.20 240)' },
  { name: 'Emerald', value: 'oklch(0.65 0.20 150)' },
  { name: 'Gold', value: 'oklch(0.75 0.15 85)' },
  { name: 'Purple', value: 'oklch(0.55 0.22 300)' },
  { name: 'Orange', value: 'oklch(0.70 0.18 50)' },
]

export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']
export const ROWS = 21

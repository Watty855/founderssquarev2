import type { GameState } from '@/lib/types'

/** Serializable play-cards options (mirrors PlayerHand PlayCardsOptions). */
export type PlayCardsOptionsPayload = {
  councilFreezeTargetId?: number
  housingHighDensity?: boolean
  useTaxBuild?: boolean
  taxBuildActionInstanceId?: string
  skipTaxBuildPrompt?: boolean
  wildCardEmulatePropertyId?: string
  suppressPlacementToast?: boolean
}

/** Client → PartyKit room authority. */
export type GameAction =
  | { type: 'end_turn' }
  | {
      type: 'build_at'
      row: number
      col: string
      propertyInstanceId: string
      housingHighDensity?: boolean
      taxBuildActionInstanceId?: string
      wildCardEmulatePropertyId?: string
    }
  | {
      type: 'income_complete'
      incomeInstanceId: string
      earnedIncome: number
      /** Property income pool before die roll — used for taxation levy. */
      totalPropertyIncomeBase: number
      doubleIncomeInstanceId?: string
      incomeResolution: 'property-roll' | 'bank-income-card'
    }
  | {
      type: 'play_cards'
      propertyInstanceId: string | null
      actionInstanceIds: string[]
      convertToCashInstanceIds: string[]
      options?: PlayCardsOptionsPayload
    }
  | { type: 'commit_actor_state'; state: GameState }
  | { type: 'animation_flags_clear' }
  /** Resolve an excess-hand discard after end_turn reported discard_required, then advance the turn. */
  | { type: 'discard_action_cards'; instanceIds: string[] }
  /** The council-freeze target's device reports their negate roll (6 negates the freeze). */
  | { type: 'council_freeze_defense'; result: number }
  /** PvP rebuttal roll (scandal / hostile takeover / police raid) reported by the defender's device. */
  | { type: 'rebuttal_roll'; result: number }

export type GameEvent =
  | { type: 'discard_required'; numToDiscard: number }
  | { type: 'turn_changed'; playerName: string; finalRound: boolean }
  | { type: 'game_over' }
  | { type: 'build_celebration'; lotName: string; suffix: string; detail: string }
  | { type: 'toast'; level: 'info' | 'success' | 'error'; message: string }
  /** Council-freeze negate roll resolved — announced with sound on every device. */
  | { type: 'council_freeze_result'; targetName: string; result: number; negated: boolean }
  /** Scandal / takeover / police-raid rebuttal resolved on every device. */
  | {
      type: 'rebuttal_result'
      kind: 'scandal' | 'hostile-takeover' | 'police-raid'
      targetName: string
      attackerName: string
      result: number
      negated: boolean
      plotLabel?: string
    }

/** Fire-and-forget effects (sounds / board notices) mirrored to every device on the board channel. */
export type BoardFx = {
  sound?: 'construction' | 'anchor' | 'income' | 'boo' | 'cheer' | 'dwindle'
  notice?: { title: string; detail?: string }
}

export type ApplyGameActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string; code?: string }

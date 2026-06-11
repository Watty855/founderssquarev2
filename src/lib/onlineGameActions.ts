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

export type GameEvent =
  | { type: 'discard_required'; numToDiscard: number }
  | { type: 'turn_changed'; playerName: string; finalRound: boolean }
  | { type: 'game_over' }
  | { type: 'build_celebration'; title: string; detail: string }
  | { type: 'toast'; level: 'info' | 'success' | 'error'; message: string }

export type ApplyGameActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string; code?: string }

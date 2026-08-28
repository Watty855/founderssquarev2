import type { GameState } from '@/lib/types'

/** Serializable play-cards options (mirrors PlayerHand PlayCardsOptions). */
export type PlayCardsOptionsPayload = {
  councilFreezeTargetId?: number
  housingHighDensity?: boolean
  useTaxBuild?: boolean
  taxBuildActionInstanceId?: string
  skipTaxBuildPrompt?: boolean
  wildCardEmulatePropertyId?: string
  wildCardEmulateActionId?: string
  suppressPlacementToast?: boolean
}

/** Client → table authority. Prefer these typed actions on the wire; `commit_actor_state` is the fallback for locally resolved card plays (including Founderbot income after playCards already committed). */
export type GameAction =
  /**
   * `seatIndex` = the seat ending its turn, so the authority can drop stale end_turns precisely.
   * `hostSkipStuckSeat` lets the host force-end a frozen live founder's turn (Unstick only).
   */
  | { type: 'end_turn'; seatIndex?: number; hostSkipStuckSeat?: boolean }
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
  /** Current calamity roller reports their die + the flavor key chosen on their device. */
  | { type: 'calamity_roll'; result: number; variantKey: string }
  /** Eligible founder declares the endgame (Final Round) or continues play. */
  | { type: 'end_game_decision'; declare: boolean }

export type GameEvent =
  | { type: 'discard_required'; numToDiscard: number }
  | { type: 'turn_changed'; playerName: string; finalRound: boolean }
  | { type: 'game_over'; reason?: 'final-round' | 'endgame-deadline' }
  | {
      type: 'end_game_offer'
      playerName: string
      clusterSize: number
      lastChance: boolean
    }
  | { type: 'build_celebration'; lotName: string; suffix: string; detail: string }
  | { type: 'toast'; level: 'info' | 'success' | 'error'; message: string }
  /** Council-freeze negate roll resolved — announced with sound on every device. */
  | {
      type: 'council_freeze_result'
      attackerName: string
      targetName: string
      result: number
      negated: boolean
    }
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
  | {
      type: 'calamity_result'
      playerName: string
      result: number
      percent: number
      lossMillion: number
      variantTitle: string
      variantFlavor: string
      cityWideComplete: boolean
    }

/** Fire-and-forget effects (sounds / board notices) mirrored to every device on the board channel. */
export type BoardFx = {
  sound?: 'construction' | 'anchor' | 'income' | 'boo' | 'cheer' | 'dwindle' | 'calamity' | 'victory-roll' | 'unsuccessful-roll'
  /** Die face 1–6 when `sound` is `calamity` — drives SFX intensity. */
  calamityFace?: number
  /**
   * When set, only this founder’s device (or the shared pass-and-play table for humans)
   * should show `notice`. Host tables skip AI-seat assessments.
   */
  audiencePlayerId?: number
  notice?: {
    title: string
    detail?: string
    /** Override default board-notice duration (ms). */
    durationMs?: number
    /** Drop any showing/queued notice and show this one immediately. */
    replace?: boolean
    /** Strong red overlay for city-wide Calamity. */
    tone?: 'default' | 'calamity'
  }
}

export type ApplyGameActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string; code?: string }

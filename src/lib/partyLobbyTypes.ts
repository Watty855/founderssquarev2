/** Shared wire format for `party/founders-lobby` and the Next.js lobby UI. */

export type SeatPlanEntry = {
  /** PartyKit connection id for human seats; omitted for bots. */
  connectionId?: string | null
  displayName: string
  isAi: boolean
  color?: string
  aiDifficulty?: 'easy' | 'normal' | 'hard'
}

/** Optional identity fields sent with `hello` / `profile_update` (shown in roster, used for captions). */
export type HelloProfile = {
  languageTag?: string
  countryCode?: string
  /** When true, this client requests on-screen chat to be translated toward their UI language when possible. */
  translationInChat?: boolean
}

export type ClientMessage =
  | { type: 'hello'; displayName: string; profile?: HelloProfile }
  | { type: 'profile_update'; profile: HelloProfile }
  | { type: 'chat'; text: string; sourceLang?: string; kind?: 'text' | 'voice' }
  | { type: 'seat_plan_set'; seats: SeatPlanEntry[] }
  | { type: 'seat_plan_request' }
  /** Host seeds authoritative board JSON once per room session. */
  | { type: 'game_init'; state: unknown }
  /** @deprecated Host pushes full snapshots — use game_action on the authority worker instead. */
  | { type: 'game_push'; state: unknown }
  /** Guest asks server for latest snapshot (direct reply). */
  | { type: 'game_request' }
  /** @deprecated — use game_action */
  | { type: 'guest_commit_state'; state: unknown }
  /** Host clears stored board so joiners wait for a new game_init. */
  | { type: 'game_clear' }
  /** Apply a typed move on the PartyKit authority (all seats, including host). */
  | { type: 'game_action'; actionId: string; action: unknown }

export type LobbyPlayer = {
  connectionId: string
  displayName: string
  languageTag?: string
  countryCode?: string
  translationInChat?: boolean
}

export type ServerMessage =
  | { type: 'roster'; players: LobbyPlayer[] }
  | {
      type: 'chat'
      fromConnectionId: string
      displayName: string
      text: string
      sourceLang?: string
      kind?: 'text' | 'voice'
    }
  | { type: 'system'; text: string }
  | {
      type: 'seat_plan'
      revision: number
      seats: SeatPlanEntry[]
      updatedByConnectionId: string | null
    }
  /** Broadcast / initial hydrate — JSON-shaped GameState from host. @deprecated prefer public_state */
  | {
      type: 'game_snapshot'
      rev: number
      state: unknown
      hostConnectionId: string | null
    }
  /** Authoritative public board (no private hands). */
  | { type: 'public_state'; rev: number; state: unknown }
  /** This connection's private hand only. */
  | {
      type: 'private_hand'
      rev: number
      playerId: number
      actionCards: unknown
      propertyCards: unknown
      newCardsDrawn?: unknown
      showNewCardsAnimation?: boolean
    }
  | {
      type: 'action_applied'
      rev: number
      actionId: string
      /** Optional — prefer public_state for board JSON (avoids duplicate payloads). */
      state?: unknown
      events?: unknown
    }
  | { type: 'action_rejected'; actionId: string; rev: number; error: string; code?: string }
  /** Host cleared stored board state on the worker. */
  | { type: 'game_cleared' }
  /** @deprecated relay via host tab */
  | { type: 'relay_guest_snapshot'; senderConnectionId: string; state: unknown }

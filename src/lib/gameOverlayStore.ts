'use client'

import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { CardFlight } from '@/components/game/CardFlightLayer'
import { CALAMITY_OUTCOME_BANNER_MS } from '@/lib/calamity'

const OPENING_PRO_TIP_DURATION_MS = 10_000

export type BoardNoticeTone = 'default' | 'calamity'

export type BoardNotice = {
  title: ReactNode
  detail?: string
  tone?: BoardNoticeTone
}

export type FinalTurnBannerPayload = {
  triggererName: string
  currentPlayerName: string
  currentPlayerColor: string
  turnsRemainingThisRound: number
}

export type OverlayState = {
  boardNotice: BoardNotice | null
  cardFlights: CardFlight[]
  hiddenInstanceIds: ReadonlySet<string>
  motivationalFlashRound: number | null
  showOpeningProTip: boolean
  showFinalTurnBanner: boolean
  finalTurnBanner: FinalTurnBannerPayload | null
  rulesQuickOpen: boolean
  propertyTypesOpen: boolean
  anchorTenetsOpen: boolean
  actionCardsOpen: boolean
}

const EMPTY_HIDDEN: ReadonlySet<string> = new Set()

const initialOverlayState: OverlayState = {
  boardNotice: null,
  cardFlights: [],
  hiddenInstanceIds: EMPTY_HIDDEN,
  motivationalFlashRound: null,
  showOpeningProTip: false,
  showFinalTurnBanner: false,
  finalTurnBanner: null,
  rulesQuickOpen: false,
  propertyTypesOpen: false,
  anchorTenetsOpen: false,
  actionCardsOpen: false,
}

let overlayState: OverlayState = initialOverlayState
const listeners = new Set<() => void>()

let boardNoticeTimer: ReturnType<typeof setTimeout> | null = null
let noticeQueue: Array<{ title: ReactNode; detail?: string; tone?: BoardNoticeTone; durationMs: number }> = []
let motivationalTimer: ReturnType<typeof setTimeout> | null = null
let openingProTipTimer: ReturnType<typeof setTimeout> | null = null
let finalTurnTimer: ReturnType<typeof setTimeout> | null = null

function emit() {
  listeners.forEach((l) => l())
}

function setOverlayState(next: OverlayState) {
  if (next === overlayState) return
  overlayState = next
  emit()
}

export function getOverlaySnapshot(): OverlayState {
  return overlayState
}

export function subscribeOverlay(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function useOverlayStore<T>(select: (s: OverlayState) => T): T {
  const selectRef = useRef(select)
  selectRef.current = select
  const cacheRef = useRef<T>(select(overlayState))
  return useSyncExternalStore(
    subscribeOverlay,
    () => {
      const next = selectRef.current(overlayState)
      if (Object.is(cacheRef.current, next)) return cacheRef.current
      cacheRef.current = next
      return next
    },
    () => selectRef.current(overlayState)
  )
}

export function resetOverlayStore() {
  if (boardNoticeTimer) {
    clearTimeout(boardNoticeTimer)
    boardNoticeTimer = null
  }
  noticeQueue = []
  if (motivationalTimer) {
    clearTimeout(motivationalTimer)
    motivationalTimer = null
  }
  if (openingProTipTimer) {
    clearTimeout(openingProTipTimer)
    openingProTipTimer = null
  }
  if (finalTurnTimer) {
    clearTimeout(finalTurnTimer)
    finalTurnTimer = null
  }
  setOverlayState(initialOverlayState)
}

export function showBoardNotice(
  title: ReactNode,
  detail?: string,
  opts?: { quick?: boolean; durationMs?: number; tone?: BoardNoticeTone; replace?: boolean }
) {
  const ms =
    opts?.durationMs ?? (opts?.tone === 'calamity' ? CALAMITY_OUTCOME_BANNER_MS : opts?.quick ? 900 : 4000)
  if (opts?.replace) {
    if (boardNoticeTimer) {
      clearTimeout(boardNoticeTimer)
      boardNoticeTimer = null
    }
    noticeQueue = []
  } else if (overlayState.boardNotice != null || boardNoticeTimer) {
    noticeQueue.push({ title, detail, tone: opts?.tone, durationMs: ms })
    return
  }
  presentBoardNotice(title, detail, opts?.tone, ms)
}

function presentBoardNotice(
  title: ReactNode,
  detail: string | undefined,
  tone: BoardNoticeTone | undefined,
  ms: number
) {
  setOverlayState({
    ...overlayState,
    boardNotice: { title, detail, tone },
  })
  boardNoticeTimer = setTimeout(() => {
    boardNoticeTimer = null
    const next = noticeQueue.shift()
    if (next) {
      presentBoardNotice(next.title, next.detail, next.tone, next.durationMs)
      return
    }
    setOverlayState({ ...overlayState, boardNotice: null })
  }, ms)
}

export function clearBoardNotice() {
  if (boardNoticeTimer) {
    clearTimeout(boardNoticeTimer)
    boardNoticeTimer = null
  }
  noticeQueue = []
  if (overlayState.boardNotice == null) return
  setOverlayState({ ...overlayState, boardNotice: null })
}

export function setOverlayCardFlights(updater: CardFlight[] | ((q: CardFlight[]) => CardFlight[])) {
  const next = typeof updater === 'function' ? updater(overlayState.cardFlights) : updater
  if (next === overlayState.cardFlights) return
  setOverlayState({ ...overlayState, cardFlights: next })
}

export function setOverlayHiddenInstanceIds(
  updater: ReadonlySet<string> | ((s: ReadonlySet<string>) => ReadonlySet<string>)
) {
  const next = typeof updater === 'function' ? updater(overlayState.hiddenInstanceIds) : updater
  if (next === overlayState.hiddenInstanceIds) return
  setOverlayState({ ...overlayState, hiddenInstanceIds: next })
}

export function setMotivationalFlashRound(round: number | null, clearAfterMs?: number) {
  if (motivationalTimer) {
    clearTimeout(motivationalTimer)
    motivationalTimer = null
  }
  if (overlayState.motivationalFlashRound === round && round == null) return
  setOverlayState({ ...overlayState, motivationalFlashRound: round })
  if (round != null && clearAfterMs != null) {
    motivationalTimer = setTimeout(() => {
      motivationalTimer = null
      setOverlayState({ ...overlayState, motivationalFlashRound: null })
    }, clearAfterMs)
  }
}

export function setShowOpeningProTip(open: boolean) {
  if (openingProTipTimer) {
    clearTimeout(openingProTipTimer)
    openingProTipTimer = null
  }
  if (overlayState.showOpeningProTip === open) return
  setOverlayState({ ...overlayState, showOpeningProTip: open })
  if (open) {
    openingProTipTimer = setTimeout(() => {
      openingProTipTimer = null
      setOverlayState({ ...overlayState, showOpeningProTip: false })
    }, OPENING_PRO_TIP_DURATION_MS)
  }
}

export function dismissOpeningProTip() {
  setShowOpeningProTip(false)
}

const FINAL_TURN_BANNER_VISIBLE_MS = 10_000

export function setFinalTurnBanner(payload: FinalTurnBannerPayload | null) {
  if (finalTurnTimer) {
    clearTimeout(finalTurnTimer)
    finalTurnTimer = null
  }
  if (payload == null) {
    if (!overlayState.showFinalTurnBanner && overlayState.finalTurnBanner == null) return
    setOverlayState({ ...overlayState, showFinalTurnBanner: false, finalTurnBanner: null })
    return
  }
  setOverlayState({
    ...overlayState,
    showFinalTurnBanner: true,
    finalTurnBanner: payload,
  })
  finalTurnTimer = setTimeout(() => {
    finalTurnTimer = null
    setOverlayState({ ...overlayState, showFinalTurnBanner: false })
  }, FINAL_TURN_BANNER_VISIBLE_MS)
}

export function setRulesQuickOpen(open: boolean) {
  if (overlayState.rulesQuickOpen === open) return
  setOverlayState({ ...overlayState, rulesQuickOpen: open })
}

export function setPropertyTypesOpen(open: boolean) {
  if (overlayState.propertyTypesOpen === open) return
  setOverlayState({ ...overlayState, propertyTypesOpen: open })
}

export function setAnchorTenetsOpen(open: boolean) {
  if (overlayState.anchorTenetsOpen === open) return
  setOverlayState({ ...overlayState, anchorTenetsOpen: open })
}

export function setActionCardsOpen(open: boolean) {
  if (overlayState.actionCardsOpen === open) return
  setOverlayState({ ...overlayState, actionCardsOpen: open })
}

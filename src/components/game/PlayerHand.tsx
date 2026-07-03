'use client'

import { Player, Plot } from '@/lib/types'
import { PropertyCard, ActionCard, CardInstance } from '@/lib/cardTypes'
import { propertyCards, actionCards, ANCHOR_WILD_CARD_EMULATE_IDS } from '@/lib/cardData'
import {
  getCivicVariantShortRule,
  getPropertyHandDisplayName,
  isCivicFlexHandCard,
} from '@/lib/civicFlexProperty'
import { getAvailableCivicVariantIds } from '@/lib/lotCategory'
import { needsEmulateChoiceBeforePlacement } from '@/lib/placementTemplate'
import { CompactCardView } from '@/components/game/CompactCardView'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFlightAnchorRef } from '@/hooks/use-flight-anchors'
import { DeckPile } from '@/components/game/DeckPile'

const springConfig = { type: 'spring' as const, stiffness: 300, damping: 24 }

export type PlayCardsOptions = {
  councilFreezeTargetId?: number
  /** Build Housing as high-density (5+ stories): $18M / $10M income / $18M end value; block takeover penalty. */
  housingHighDensity?: boolean
  /** Build selected property using Build with Tax Dollars card (half cost). */
  useTaxBuild?: boolean
  /** Specific Build with Tax Dollars instance to spend for this build. */
  taxBuildActionInstanceId?: string
  /** Internal: skip prompt when user already chose whether to use tax dollars. */
  skipTaxBuildPrompt?: boolean
  /** Anchor Wild Card or Civic flex: property id to emulate when starting placement. */
  wildCardEmulatePropertyId?: string
  /** Omit info toasts when starting placement early (card click highlights valid lots before Build). */
  suppressPlacementToast?: boolean
}

interface PlayerHandProps {
  player: Player
  /** Other players (for City Council Freeze target). Omit or pass [] if not needed. */
  opponents?: Player[]
  /** When false, cards still render for review but cannot be clicked (e.g. solo human during AI turns). */
  handInteractionsActive: boolean
  onPlayCards: (
    propertyInstanceId: string | null,
    actionInstanceIds: string[],
    convertToCashInstanceIds: string[],
    options?: PlayCardsOptions
  ) => void
  onEndTurn: () => void
  placementMode?: { active: boolean; propertyCardId: string | null; housingHighDensity?: boolean }
  investmentSelectMode?: { active: boolean; validPlots: Plot[]; contributionMillion: number }
  discardPropertySelectMode?: { active: boolean; selectedPropertyInstanceIds: string[] }
  onToggleDiscardProperty?: (propertyInstanceId: string) => void
  onOpenDiscardPropertyConfirm?: () => void
  onCancelDiscardProperty?: () => void
  removeInvestorsSelectMode?: { active: boolean; validPlots: Plot[] }
  takeoverSelectMode?: { active: boolean; validPlots: Plot[] }
  scandalSelectMode?: { active: boolean; validPlots: Plot[] }
  /** Rezoning: pick property from hand, optional housing density, then board (driven from GameApp). */
  rezoningPhase?: 'inactive' | 'pick-property' | 'pick-housing-density' | 'pick-plot'
  /** Build with Tax Dollars: pick a property in hand to build at half cost. */
  taxBuildPhase?: 'inactive' | 'pick-property'
  /** Build with Tax Dollars action instance when `taxBuildPhase` is pick-property. */
  taxBuildActionInstanceId?: string
  onTaxBuildPropertySelect?: (propertyInstanceId: string) => void
  onCancelTaxBuild?: () => void
  onRezoningPropertySelect?: (propertyInstanceId: string) => void
  onRezoningHousingStandard?: () => void
  onRezoningHousingHighDensity?: () => void
  onCancelRezoning?: () => void
  onCancelInvestment?: () => void
  onCancelRemoveInvestors?: () => void
  onCancelTakeover?: () => void
  onCancelScandal?: () => void
  onCancelPlacement?: () => void
  /** Highlights valid lots when a property card opens (skipped for Anchor Wild Card and tax-choice flows). */
  onPropertyCardPeekPlacement?: (instanceId: string) => void
  showNewCardsAnimation?: boolean
  newCardsDrawn?: CardInstance[]
  /** Card-flight system: instances currently mid-flight render at opacity 0 so the fan layout stays stable but the flying overlay is the only thing the player sees moving. */
  hiddenInstanceIds?: Set<string>
  /** Whether the underlying decks still have cards. Drives the empty placeholder on each pile. */
  propertyDeckHasCards?: boolean
  actionDeckHasCards?: boolean
  /** Board lots — used to filter civic flex options to vacant C cells on the board. */
  plots?: Plot[]
  crossingTheLineActive?: boolean
}

/** Stable anchor key for a single card slot in any hand — both for source rect (discards out) and target rect (current player draws in). */
export function handCardAnchorKey(playerId: number, instanceId: string): string {
  return `hand-card-${playerId}-${instanceId}`
}

/** Per-section hand-target anchor. New draws fly to the property fan or the action fan depending on which deck they came from. */
export function handTargetAnchorKey(playerId: number, cardType: 'property' | 'action'): string {
  return `hand-target-${playerId}-${cardType}`
}

interface HandCardSlotProps {
  playerId: number
  instanceId: string
  index: number
  cardGap: number
  hoverOffset: number
  isHovered: boolean
  /** A flight is currently animating *to* (draw) or *from* (discard) this slot — render at opacity 0 so the only visible movement is the flying overlay. */
  isHidden: boolean
  onMouseEnter: () => void
  draggable: boolean
  onDragStart: (e: any) => void
  children: React.ReactNode
}

/**
 * One physical slot in the hand fan. Owns its flight anchor so the flight layer
 * can read the slot's rect synchronously when queueing a discard flight (even
 * after the underlying card-instance has been removed from the hand state, the
 * anchor's last-known rect is still resolvable via FlightAnchorProvider).
 */
function HandCardSlot({
  playerId,
  instanceId,
  index,
  cardGap,
  hoverOffset,
  isHovered,
  isHidden,
  onMouseEnter,
  draggable,
  onDragStart,
  children,
}: HandCardSlotProps) {
  const setSlotAnchor = useFlightAnchorRef(handCardAnchorKey(playerId, instanceId))
  return (
    <motion.div
      ref={setSlotAnchor}
      style={{
        position: 'absolute',
        bottom: 0,
        zIndex: isHovered ? 50 : index,
        opacity: isHidden ? 0 : 1,
        pointerEvents: isHidden ? 'none' : 'auto',
      }}
      animate={{
        x: index * cardGap + hoverOffset,
        y: isHovered ? -12 : 0,
        scale: isHovered ? 1.06 : 1,
      }}
      transition={springConfig}
      onMouseEnter={onMouseEnter}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {children}
    </motion.div>
  )
}

export function PlayerHand({
  player,
  opponents = [],
  handInteractionsActive,
  onPlayCards,
  onEndTurn,
  placementMode,
  investmentSelectMode,
  discardPropertySelectMode,
  onToggleDiscardProperty,
  onOpenDiscardPropertyConfirm,
  onCancelDiscardProperty,
  removeInvestorsSelectMode,
  takeoverSelectMode,
  scandalSelectMode,
  rezoningPhase = 'inactive',
  taxBuildPhase = 'inactive',
  taxBuildActionInstanceId,
  onTaxBuildPropertySelect,
  onCancelTaxBuild,
  onRezoningPropertySelect,
  onRezoningHousingStandard,
  onRezoningHousingHighDensity,
  onCancelRezoning,
  onCancelInvestment,
  onCancelRemoveInvestors,
  onCancelTakeover,
  onCancelScandal,
  onCancelPlacement,
  onPropertyCardPeekPlacement,
  showNewCardsAnimation,
  newCardsDrawn,
  hiddenInstanceIds,
  propertyDeckHasCards = true,
  actionDeckHasCards = true,
  plots = [],
  crossingTheLineActive = false,
}: PlayerHandProps) {
  const setPropertyTargetAnchor = useFlightAnchorRef(handTargetAnchorKey(player.id, 'property'))
  const setActionTargetAnchor = useFlightAnchorRef(handTargetAnchorKey(player.id, 'action'))
  const [cardDialog, setCardDialog] = useState<{
    open: boolean
    type: 'property' | 'action'
    instanceId: string
  } | null>(null)

  /** Hover key is `prop-{instanceId}` or `act-{instanceId}` so the property/action fans can spread independently. */
  const [hoveredIndex, setHoveredIndex] = useState<string | null>(null)
  const [councilFreezeTargetId, setCouncilFreezeTargetId] = useState<number | null>(null)
  const [wildCardTab, setWildCardTab] = useState<'build' | 'bank'>('build')
  const [wildCardEmulateId, setWildCardEmulateId] = useState<string | null>(null)
  const [civicVariantId, setCivicVariantId] = useState<string | null>(null)

  const propertyCardsList = (player?.propertyCards || [])
    .map(instance => {
      const card = propertyCards.find(c => c.id === instance.cardId)
      return card ? { ...card, instance } : null
    })
    .filter(Boolean) as (PropertyCard & { instance: CardInstance })[]

  const actionCardsList = (player?.actionCards || [])
    .map(instance => {
      const card = actionCards.find(c => c.id === instance.cardId)
      return card ? { ...card, instance } : null
    })
    .filter(Boolean) as (ActionCard & { instance: CardInstance })[]

  const propertyHandCards = propertyCardsList.map((c) => ({ ...c, cardType: 'property' as const }))
  const actionHandCards = actionCardsList.map((c) => ({ ...c, cardType: 'action' as const }))

  const availableCivicVariantIds = useMemo(
    () => getAvailableCivicVariantIds(plots, crossingTheLineActive),
    [plots, crossingTheLineActive]
  )

  useEffect(() => {
    if (!cardDialog?.open || cardDialog.type !== 'property') return
    const inst = player?.propertyCards?.find((i) => i.instanceId === cardDialog.instanceId)
    const def = inst ? propertyCards.find((c) => c.id === inst.cardId) : undefined
    if (def?.id === 'anchor-wild-card') {
      setWildCardTab('build')
      setWildCardEmulateId(null)
    }
    if (def && isCivicFlexHandCard(def)) {
      const available = getAvailableCivicVariantIds(plots, crossingTheLineActive)
      setCivicVariantId(available.length === 1 ? available[0] : null)
    }
  }, [cardDialog?.open, cardDialog?.instanceId, cardDialog?.type, player?.propertyCards, plots, crossingTheLineActive])

  const handleCardClick = (instanceId: string, type: 'property' | 'action') => {
    if (!handInteractionsActive) return
    if (discardPropertySelectMode?.active && type === 'property' && onToggleDiscardProperty) {
      onToggleDiscardProperty(instanceId)
      return
    }
    if (rezoningPhase === 'pick-property' && type === 'property' && onRezoningPropertySelect) {
      onRezoningPropertySelect(instanceId)
      return
    }
    if (taxBuildPhase === 'pick-property' && type === 'property' && onTaxBuildPropertySelect) {
      const def = propertyCardsList.find((c) => c.instance.instanceId === instanceId)
      if (def && !needsEmulateChoiceBeforePlacement(def)) {
        onTaxBuildPropertySelect(instanceId)
        return
      }
    }
    if (
      type === 'property' &&
      onPropertyCardPeekPlacement &&
      rezoningPhase === 'inactive' &&
      taxBuildPhase === 'inactive' &&
      !discardPropertySelectMode?.active &&
      !(() => {
        const def = propertyCardsList.find((c) => c.instance.instanceId === instanceId)
        return def && needsEmulateChoiceBeforePlacement(def)
      })()
    ) {
      onPropertyCardPeekPlacement(instanceId)
    }
    setCardDialog({ open: true, type, instanceId })
  }

  const handleBuildProperty = () => {
    if (!cardDialog) return
    onPlayCards(cardDialog.instanceId, [], [], { housingHighDensity: false })
    setCardDialog(null)
  }

  const handleBuildHousing = (highDensity: boolean) => {
    if (!cardDialog) return
    onPlayCards(cardDialog.instanceId, [], [], { housingHighDensity: highDensity })
    setCardDialog(null)
  }

  const handleCashCard = () => {
    if (!cardDialog) return
    onPlayCards(null, [], [cardDialog.instanceId])
    setCardDialog(null)
  }

  const handleBuildAnchorWildCard = () => {
    if (!cardDialog || !wildCardEmulateId) return
    onPlayCards(cardDialog.instanceId, [], [], {
      wildCardEmulatePropertyId: wildCardEmulateId,
      ...(taxBuildPhase === 'pick-property' && taxBuildActionInstanceId
        ? {
            useTaxBuild: true,
            taxBuildActionInstanceId: taxBuildActionInstanceId,
            skipTaxBuildPrompt: true,
          }
        : {}),
    })
    setCardDialog(null)
  }

  const handleBuildCivicFlex = () => {
    if (!cardDialog || !civicVariantId) return
    onPlayCards(cardDialog.instanceId, [], [], {
      wildCardEmulatePropertyId: civicVariantId,
      ...(taxBuildPhase === 'pick-property' && taxBuildActionInstanceId
        ? {
            useTaxBuild: true,
            taxBuildActionInstanceId: taxBuildActionInstanceId,
            skipTaxBuildPrompt: true,
          }
        : {}),
    })
    setCardDialog(null)
  }

  const handlePlayAction = () => {
    if (!cardDialog) return
    const actionMeta = actionCardsList.find((c) => c.instance.instanceId === cardDialog.instanceId)
    if (actionMeta?.id === 'city-council-freeze') {
      if (councilFreezeTargetId === null) return
      onPlayCards(null, [cardDialog.instanceId], [], { councilFreezeTargetId })
    } else {
      onPlayCards(null, [cardDialog.instanceId], [])
    }
    setCardDialog(null)
    setCouncilFreezeTargetId(null)
  }

  const handleCouncilFreezeTargetSelect = (targetPlayerId: number) => {
    if (!cardDialog) return
    setCouncilFreezeTargetId(targetPlayerId)
    onPlayCards(null, [cardDialog.instanceId], [], { councilFreezeTargetId: targetPlayerId })
    setCardDialog(null)
    setCouncilFreezeTargetId(null)
  }



  const currentCard = cardDialog ? (
    cardDialog.type === 'property'
      ? propertyCardsList.find(c => c.instance.instanceId === cardDialog.instanceId)
      : actionCardsList.find(c => c.instance.instanceId === cardDialog.instanceId)
  ) : null

  const cardWidth = 110
  /** Fan offset shrinks gently (3px per card past 5) instead of jumping between tiers,
   *  so playing / drawing a card doesn't re-space the whole hand. Floor keeps crowded
   *  hands readable on tablet widths (was 32px overlap for 7+ cards). */
  const fanGap = (len: number) => Math.max(38, 52 - Math.max(0, len - 5) * 3)
  const propertyGap = fanGap(propertyHandCards.length)
  const propertyFanWidth = propertyHandCards.length > 0 ? cardWidth + (propertyHandCards.length - 1) * propertyGap : 0
  const actionGap = fanGap(actionHandCards.length)
  const actionFanWidth = actionHandCards.length > 0 ? cardWidth + (actionHandCards.length - 1) * actionGap : 0

  return (
    <>
      {/* Tax Build: pick a property card in hand */}
      <AnimatePresence>
        {taxBuildPhase === 'pick-property' && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.35)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#fcd34d' }}>
              Build with Tax Dollars: choose a highlighted property card to build at half cost.
            </span>
            <button
              type="button"
              onClick={onCancelTaxBuild}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rezoningPhase === 'pick-property' && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
              border: '1px solid rgba(167, 139, 250, 0.35)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#d8b4fe' }}>
              Rezoning: click a highlighted property card in your hand (not an anchor), then a violet-highlighted vacant
              lot. Roll — total 5–6 after civic influence in that block approves the build.
            </span>
            <button
              type="button"
              onClick={onCancelRezoning}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rezoningPhase === 'pick-housing-density' && (
          <motion.div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 8,
              padding: '8px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
              border: '1px solid rgba(167, 139, 250, 0.35)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#d8b4fe' }}>Housing density for rezoning:</span>
            <button
              type="button"
              onClick={onRezoningHousingStandard}
              className="btn-ps"
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                backgroundColor: '#0070cc',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Standard — $10M
            </button>
            <button
              type="button"
              onClick={onRezoningHousingHighDensity}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                backgroundColor: 'transparent',
                color: '#fbbf24',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid rgba(251, 191, 36, 0.5)',
                cursor: 'pointer',
              }}
            >
              High-density — $18M
            </button>
            <button
              type="button"
              onClick={onCancelRezoning}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rezoningPhase === 'pick-plot' && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
              border: '1px solid rgba(167, 139, 250, 0.35)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#d8b4fe' }}>
              Select a vacant city lot (violet outline), then roll in the dialog.
            </span>
            <button
              type="button"
              onClick={onCancelRezoning}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {scandalSelectMode?.active && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(232,121,249,0.08)',
              border: '1px solid rgba(232,121,249,0.28)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#e879f9' }}>
              Scandal: click a fuchsia-highlighted built anchor tenant. Roll 6+ to succeed (Influencer you own gives +1). The owner may
              roll 6 to negate.
            </span>
            <button
              type="button"
              onClick={onCancelScandal}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {takeoverSelectMode?.active && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.28)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#fcd34d' }}>
              Hostile Takeover: click an amber-highlighted opponent property (same block or orthogonal to your built
              lots). You will pay $1M, then roll — 5–6 succeeds.
            </span>
            <button
              type="button"
              onClick={onCancelTakeover}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {removeInvestorsSelectMode?.active && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(244,114,182,0.1)',
              border: '1px solid rgba(244,114,182,0.35)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#f9a8d4' }}>
              Remove Investors: click your highlighted property with investors, then roll (5+ after block influence). Pay 50% to each investor if you succeed.
            </span>
            <button
              type="button"
              onClick={onCancelRemoveInvestors}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {discardPropertySelectMode?.active && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(45,212,191,0.1)',
              border: '1px solid rgba(45,212,191,0.35)',
              flexWrap: 'wrap',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#5eead4' }}>
              Discard Property Cards: teal = in hand; orange = selected to discard. Choose any subset (or none), then
              review. You draw one property per card discarded.
            </span>
            <button
              type="button"
              onClick={onOpenDiscardPropertyConfirm}
              disabled={!onOpenDiscardPropertyConfirm}
              style={{
                height: 30,
                padding: '0 14px',
                borderRadius: 8,
                backgroundColor: 'rgba(45,212,191,0.25)',
                color: '#ccfbf1',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid rgba(45,212,191,0.5)',
                cursor: onOpenDiscardPropertyConfirm ? 'pointer' : 'default',
              }}
            >
              Review / discard…
            </button>
            <button
              type="button"
              onClick={onCancelDiscardProperty}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {investmentSelectMode?.active && (
          <motion.div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8, padding: '6px 16px', borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#86efac' }}>
              Investment: click a highlighted opponent property ($
              {investmentSelectMode.contributionMillion}M to the owner).
            </span>
            <button
              type="button"
              onClick={onCancelInvestment}
              style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {placementMode?.active && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(30,174,219,0.1)',
              border: '1px solid rgba(30,174,219,0.2)',
            }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1eaedb' }}>
              {placementMode?.housingHighDensity
                ? 'Select a plot — high-density housing ($18M). Large structure: neon outline, −1 takeover influence on this city block.'
                : 'Legal lots pulse on the board for this card — click one to build, or Cancel build'}
            </span>
            {onCancelPlacement ? (
              <button
                type="button"
                onClick={() => onCancelPlacement()}
                style={{ fontSize: 11, color: '#8888a0', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancel build
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
      {/* New cards notification */}
      <AnimatePresence>
        {showNewCardsAnimation && newCardsDrawn && newCardsDrawn.length > 0 && handInteractionsActive && (
          <motion.div
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div style={{ backgroundColor: 'rgba(30,174,219,0.15)', color: '#1eaedb', padding: '4px 16px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: '1px solid rgba(30,174,219,0.2)' }}>
              Drew {newCardsDrawn.length} action cards
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!handInteractionsActive ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 8,
            padding: '4px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(148,163,184,0.08)',
            border: '1px solid rgba(148,163,184,0.2)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(226,232,240,0.65)' }}>
            Review your hand — card plays unlock on your turn
          </span>
        </div>
      ) : null}

      {/* Cards row: [Property Deck] [Property Fan] [Action Fan] [Action Deck].
          Each deck flanks its matching section so the draw flight is a short, readable hop.
          When inactive, pointers are disabled so preview hovers/dialogs can't fire while you browse layout. */}
      <div
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 24 }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <DeckPile variant="property" hasCards={propertyDeckHasCards} />

        {/* Property fan */}
        <div
          ref={setPropertyTargetAnchor}
          style={{
            position: 'relative',
            width: propertyFanWidth,
            height: 165,
            pointerEvents: handInteractionsActive ? 'auto' : 'none',
          }}
        >
          {propertyHandCards.map((card, index) => {
            const slotKey = `prop-${card.instance.instanceId}`
            const isHovered = hoveredIndex === slotKey
            const hoverOffset =
              hoveredIndex !== null && typeof hoveredIndex === 'string' && hoveredIndex.startsWith('prop-')
                ? (() => {
                    const hoveredIdx = propertyHandCards.findIndex(
                      (c) => `prop-${c.instance.instanceId}` === hoveredIndex
                    )
                    return hoveredIdx >= 0 ? (index < hoveredIdx ? -10 : index > hoveredIdx ? 10 : 0) : 0
                  })()
                : 0
            const isHidden = hiddenInstanceIds?.has(card.instance.instanceId) === true
            return (
              <HandCardSlot
                key={card.instance.instanceId}
                playerId={player.id}
                instanceId={card.instance.instanceId}
                index={index}
                cardGap={propertyGap}
                hoverOffset={hoverOffset}
                isHovered={isHovered}
                isHidden={isHidden}
                onMouseEnter={() => setHoveredIndex(slotKey)}
                draggable={false}
                onDragStart={() => {}}
              >
                <CompactCardView
                  card={card}
                  onClick={() => handleCardClick(card.instance.instanceId, 'property')}
                  selected={discardPropertySelectMode?.selectedPropertyInstanceIds.includes(card.instance.instanceId)}
                  discardPickable={discardPropertySelectMode?.active === true}
                  rezoningPickable={
                    rezoningPhase === 'pick-property' &&
                    (card as PropertyCard).type !== 'anchor'
                  }
                  taxBuildPickable={
                    taxBuildPhase === 'pick-property' &&
                    (card as PropertyCard).id !== 'anchor-wild-card'
                  }
                />
              </HandCardSlot>
            )
          })}
        </div>

        {/* Action fan */}
        <div
          ref={setActionTargetAnchor}
          style={{
            position: 'relative',
            width: actionFanWidth,
            height: 165,
            pointerEvents: handInteractionsActive ? 'auto' : 'none',
          }}
        >
          {actionHandCards.map((card, index) => {
            const slotKey = `act-${card.instance.instanceId}`
            const isHovered = hoveredIndex === slotKey
            const hoverOffset =
              hoveredIndex !== null && typeof hoveredIndex === 'string' && hoveredIndex.startsWith('act-')
                ? (() => {
                    const hoveredIdx = actionHandCards.findIndex(
                      (c) => `act-${c.instance.instanceId}` === hoveredIndex
                    )
                    return hoveredIdx >= 0 ? (index < hoveredIdx ? -10 : index > hoveredIdx ? 10 : 0) : 0
                  })()
                : 0
            const isHidden = hiddenInstanceIds?.has(card.instance.instanceId) === true
            return (
              <HandCardSlot
                key={card.instance.instanceId}
                playerId={player.id}
                instanceId={card.instance.instanceId}
                index={index}
                cardGap={actionGap}
                hoverOffset={hoverOffset}
                isHovered={isHovered}
                isHidden={isHidden}
                onMouseEnter={() => setHoveredIndex(slotKey)}
                draggable={false}
                onDragStart={() => {}}
              >
                <CompactCardView
                  card={card}
                  onClick={() => handleCardClick(card.instance.instanceId, 'action')}
                  selected={false}
                />
              </HandCardSlot>
            )
          })}
        </div>

        <DeckPile variant="action" hasCards={actionDeckHasCards} />
      </div>

      {/* Card action dialog */}
      <Dialog
        open={cardDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setCardDialog(null)
            setCouncilFreezeTargetId(null)
          }
        }}
      >
        <DialogContent
          style={{
            maxWidth: 360,
            backgroundColor: '#141418',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: '24px 24px 16px',
          }}
          className="[&>button:first-child]:hidden"
        >
          <DialogHeader style={{ marginBottom: 16 }}>
            <DialogTitle style={{ fontSize: 18, fontWeight: 400, marginBottom: 4 }}>
              {currentCard && cardDialog?.type === 'property'
                ? getPropertyHandDisplayName(currentCard as PropertyCard)
                : currentCard?.name}
            </DialogTitle>
            {cardDialog?.type === 'property' &&
            currentCard &&
            'subtitle' in currentCard &&
            (currentCard as PropertyCard).subtitle ? (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#7dd3fc',
                  marginBottom: 10,
                  letterSpacing: '0.02em',
                }}
              >
                {(currentCard as PropertyCard).subtitle}
              </div>
            ) : null}
            <DialogDescription style={{ fontSize: 13, color: '#8888a0', lineHeight: 1.4 }}>
              {cardDialog?.type === 'property' && currentCard && (
                currentCard.id === 'church' ? (
                  <>
                    Build to create Church affiliation influence: place it on a highlighted center anchor tenet (AT) (not Union). It grants +1 influence across the entire board (max +1), and +1 income on your qualifying lots during Income per printed rules. Or cash it in for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'farm-coop' ? (
                  <>
                    Build Farm Bureau on a highlighted center anchor tenet adjacent to farmland (not Union). +1 Farmland-linked influence (max +1 toward Hostile Takeover there), +1 income on your qualifying lots in the same city block during Income, takeover bonus evaluated on the target property’s block. Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'port-authority' ? (
                  <>
                    Build to engineer Port Authority on a highlighted center anchor tenet adjacent to the railway district (not Union). +1 Railway district influence (max +1 toward Hostile Takeover there), +1 income on qualifying lots in the same city block during Income; takeover modifiers use only the target lot’s city block. Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'arts-council' ? (
                  <>
                    Build to craft Arts Council on a highlighted center anchor tenet adjacent to the riverfront district (not Union). +1 River Front influence (max +1 toward Hostile Takeover there), +1 income on qualifying lots in the same city block during Income; takeover modifiers use only the target lot’s city block. Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'tourism-office' ? (
                  <>
                    Build to conceive Tourism Office on a highlighted center anchor tenet adjacent to the mountain cove district (not
                    Union). +1 Mountain Cove influence (max +1 toward Hostile Takeover there), +1 income on qualifying lots in the same city block during Income; takeover modifiers use only the target lot’s city block. Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'regulation-bureau' ? (
                  <>
                    Build a Regulation Bureau on a highlighted center anchor tenet (AT) (not Union). Your other properties in the same
                    city block get +1 income on your Income roll. Rivals’ lots here have −1 takeover influence vs Hostile Takeover (+1 attacker roll per distinct non-defender bureau in this block). Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'anchor-wild-card' ? (
                  <>
                    Build for $6M as any standard anchor below (placement and all rules match that anchor), or bank for $
                    {currentCard.bankValue}M. Celebration and end-game scoring use the anchor you choose.
                  </>
                ) : isCivicFlexHandCard(currentCard as PropertyCard) ? (
                  <>
                    Build for ${(currentCard as PropertyCard).buildCost}M as City Hall, Courthouse, Police, or Civic Center
                    below. Board-wide civic strengths apply for the first three; Civic Center influence is only on its city
                    block. Or bank for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'media' ? (
                  <>
                    Build to launch an Influencer on a highlighted center anchor tenet (AT) (not Union). +1 income on qualifying lots in the same city block during Income; Scandals get at most +1 from Influencer plus News Outlet combined (does not stack). Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'news-outlet' ? (
                  <>
                    Build a News Outlet on a highlighted center anchor tenet (AT) (not Union). +1 income on qualifying lots in the same city block during Income; Scandals get at most +1 from News Outlet plus Influencer combined (does not stack). Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'mafia' ? (
                  <>
                    Build Mafia on a highlighted center anchor tenet (AT) (not Union). +1 Hostile Takeover influence when the target shares your Mafia’s city block; +1 income on your qualifying lots there; opponents pay extortion per printed rules. Or bank it for ${currentCard.bankValue}M.
                  </>
                ) : currentCard.id === 'union' ? (
                  <>
                    Build Union on a Union-designated anchor lot. +1 district influence (printed). On Income: +$1M per other property you own on this block (like Church); rivals’ properties on this block lose $1M each on their own Income rolls (not paid to you). Or bank for $
                    {currentCard.bankValue}M.
                  </>
                ) : (
                  <>Build for ${(currentCard as PropertyCard).buildCost}M or cash for ${currentCard.bankValue}M</>
                )
              )}
              {cardDialog?.type === 'action' && currentCard && (
                <>Play this action or cash for ${currentCard.bankValue}M</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cardDialog?.type === 'property' && currentCard && (
              <>
                {currentCard.id === 'anchor-wild-card' ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <button
                        type="button"
                        onClick={() => setWildCardTab('build')}
                        style={{
                          flex: 1,
                          height: 36,
                          borderRadius: 8,
                          border: wildCardTab === 'build' ? '2px solid #0070cc' : '1px solid rgba(255,255,255,0.15)',
                          backgroundColor: wildCardTab === 'build' ? 'rgba(0,112,204,0.15)' : 'transparent',
                          color: '#f0f0f5',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Build ($6M)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWildCardTab('bank')}
                        style={{
                          flex: 1,
                          height: 36,
                          borderRadius: 8,
                          border: wildCardTab === 'bank' ? '2px solid #0070cc' : '1px solid rgba(255,255,255,0.15)',
                          backgroundColor: wildCardTab === 'bank' ? 'rgba(0,112,204,0.15)' : 'transparent',
                          color: '#f0f0f5',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Bank (${currentCard.bankValue}M)
                      </button>
                    </div>
                    {wildCardTab === 'build' && (
                      <>
                        <p style={{ fontSize: 12, color: '#8888a0', marginBottom: 8, lineHeight: 1.45 }}>
                          Select an anchor identity. Valid build locations update for that anchor after you continue.
                        </p>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 6,
                            maxHeight: 200,
                            overflowY: 'auto',
                            marginBottom: 8,
                          }}
                        >
                          {ANCHOR_WILD_CARD_EMULATE_IDS.map((emId) => {
                            const ac = propertyCards.find((c) => c.id === emId)
                            if (!ac) return null
                            const sel = wildCardEmulateId === emId
                            return (
                              <button
                                key={emId}
                                type="button"
                                onClick={() => setWildCardEmulateId(emId)}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: 8,
                                  border: sel ? '2px solid #0070cc' : '1px solid rgba(255,255,255,0.12)',
                                  backgroundColor: sel ? 'rgba(0,112,204,0.12)' : 'transparent',
                                  color: '#e8e8f0',
                                  fontSize: 11,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  lineHeight: 1.3,
                                }}
                              >
                                {ac.name}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={handleBuildAnchorWildCard}
                          disabled={!wildCardEmulateId}
                          className="btn-ps"
                          style={{
                            height: 42,
                            borderRadius: 10,
                            backgroundColor: wildCardEmulateId ? '#0070cc' : '#333348',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            border: '2px solid transparent',
                            cursor: wildCardEmulateId ? 'pointer' : 'not-allowed',
                            opacity: wildCardEmulateId ? 1 : 0.6,
                          }}
                        >
                          {wildCardEmulateId
                            ? `Build as ${
                                propertyCards.find((c) => c.id === wildCardEmulateId)?.name ?? 'anchor'
                              } — $6M`
                            : 'Choose an anchor to build'}
                        </button>
                      </>
                    )}
                    {wildCardTab === 'bank' && (
                      <button
                        type="button"
                        onClick={handleCashCard}
                        style={{
                          height: 42,
                          borderRadius: 10,
                          backgroundColor: 'transparent',
                          color: '#f0f0f5',
                          fontSize: 14,
                          fontWeight: 500,
                          border: '1px solid rgba(255,255,255,0.15)',
                          cursor: 'pointer',
                        }}
                      >
                        Bank Anchor Wild Card — ${currentCard.bankValue}M
                      </button>
                    )}
                  </>
                ) : isCivicFlexHandCard(currentCard as PropertyCard) ? (
                  <>
                    <p style={{ fontSize: 12, color: '#8888a0', marginBottom: 8, lineHeight: 1.45 }}>
                      Choose which civic building this card becomes. Only options with vacant C lots on the board are shown.
                    </p>
                    {availableCivicVariantIds.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
                        No vacant civic (C) lots on the board match any civic building right now.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {availableCivicVariantIds.map((variantId) => {
                          const variant = propertyCards.find((c) => c.id === variantId)
                          if (!variant) return null
                          const sel = civicVariantId === variantId
                          return (
                            <button
                              key={variantId}
                              type="button"
                              onClick={() => setCivicVariantId(variantId)}
                              style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: sel ? '2px solid #0070cc' : '1px solid rgba(0,112,204,0.45)',
                                backgroundColor: sel ? 'rgba(0,112,204,0.12)' : 'rgba(0,112,204,0.06)',
                                color: '#e8e8f0',
                                fontSize: 11,
                                textAlign: 'left',
                                cursor: 'pointer',
                                lineHeight: 1.35,
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{variant.name}</div>
                              <div style={{ color: '#8888a0', fontSize: 10 }}>
                                {getCivicVariantShortRule(variantId, plots)}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleBuildCivicFlex}
                      disabled={!civicVariantId}
                      className="btn-ps"
                      style={{
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: civicVariantId ? '#0070cc' : '#333348',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        border: '2px solid transparent',
                        cursor: civicVariantId ? 'pointer' : 'not-allowed',
                        opacity: civicVariantId ? 1 : 0.6,
                        marginBottom: 8,
                      }}
                    >
                      {civicVariantId
                        ? `Build as ${
                            propertyCards.find((c) => c.id === civicVariantId)?.name ?? 'civic'
                          } — $${(currentCard as PropertyCard).buildCost}M`
                        : 'Choose a civic building to build'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCashCard}
                      style={{
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: 'transparent',
                        color: '#f0f0f5',
                        fontSize: 14,
                        fontWeight: 500,
                        border: '1px solid rgba(255,255,255,0.15)',
                        cursor: 'pointer',
                      }}
                    >
                      Bank Civic — ${currentCard.bankValue}M
                    </button>
                  </>
                ) : currentCard.name === 'Housing' ? (
                  <>
                    <p style={{ fontSize: 12, color: '#8888a0', lineHeight: 1.45, marginBottom: 4 }}>
                      Standard (1–4 stories): $10M, $5M income. High-density (5+ stories): $18M, $10M income, end value $18M —{' '}
                      <span style={{ color: '#fbbf24' }}>−1 takeover influence</span> on this city block per high-density lot.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleBuildHousing(false)}
                      className="btn-ps"
                      style={{
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: '#0070cc',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        border: '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      Build standard — ${(currentCard as PropertyCard).buildCost}M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBuildHousing(true)}
                      className="btn-ps"
                      style={{
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: 'transparent',
                        color: '#fbbf24',
                        fontSize: 14,
                        fontWeight: 600,
                        border: '2px solid rgba(251, 191, 36, 0.5)',
                        cursor: 'pointer',
                      }}
                    >
                      High-density — $18M
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleBuildProperty}
                    className="btn-ps"
                    style={{
                      height: 42,
                      borderRadius: 10,
                      backgroundColor: '#0070cc',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      border: '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {currentCard.id === 'church'
                      ? `Create Church affiliation influence — ${(currentCard as PropertyCard).buildCost}M`
                      : currentCard.id === 'farm-coop'
                        ? `Form Farm Bureau anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                        : currentCard.id === 'port-authority'
                          ? `Engineer Port Authority anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                          : currentCard.id === 'arts-council'
                            ? `Craft Arts Council anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                            : currentCard.id === 'tourism-office'
                              ? `Conceive Tourism Office anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                              : currentCard.id === 'regulation-bureau'
                                ? `Establish Regulation Bureau anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                              : currentCard.id === 'media'
                                ? `Launch Influencer anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                                : currentCard.id === 'news-outlet'
                                  ? `Open News Outlet anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                                : currentCard.id === 'mafia'
                                  ? `Build Mafia anchor influence — ${(currentCard as PropertyCard).buildCost}M`
                                  : currentCard.id === 'union'
                                    ? `Seat Union anchor — ${(currentCard as PropertyCard).buildCost}M`
                      : `Build for ${(currentCard as PropertyCard).buildCost}M`}
                  </button>
                )}
                <button
                  onClick={handleCashCard}
                  style={{ height: 42, borderRadius: 10, backgroundColor: 'transparent', color: '#f0f0f5', fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}
                >
                  {currentCard.id === 'church'
                    ? `Bank Church affiliation — $${currentCard.bankValue}M`
                    : currentCard.id === 'farm-coop'
                      ? `Bank Farm Bureau — $${currentCard.bankValue}M`
                      : currentCard.id === 'port-authority'
                        ? `Bank Port Authority — $${currentCard.bankValue}M`
                        : currentCard.id === 'arts-council'
                          ? `Bank Arts Council — $${currentCard.bankValue}M`
                            : currentCard.id === 'tourism-office'
                            ? `Bank Tourism Office — $${currentCard.bankValue}M`
                            : currentCard.id === 'regulation-bureau'
                              ? `Bank Regulation Bureau — $${currentCard.bankValue}M`
                            : currentCard.id === 'media'
                              ? `Bank Influencer — $${currentCard.bankValue}M`
                              : currentCard.id === 'news-outlet'
                                ? `Bank News Outlet — $${currentCard.bankValue}M`
                              : currentCard.id === 'mafia'
                                ? `Bank Mafia — $${currentCard.bankValue}M`
                                : currentCard.id === 'union'
                                  ? `Bank Union — $${currentCard.bankValue}M`
                      : `Cash ${currentCard.bankValue}M`}
                </button>
              </>
            )}
            {cardDialog?.type === 'action' && currentCard && (
              <>
                {currentCard.id === 'city-council-freeze' && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 12, color: '#8888a0', marginBottom: 8 }}>Choose a player to target</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {opponents.map((opp) => (
                        <button
                          key={opp.id}
                          type="button"
                          onClick={() => handleCouncilFreezeTargetSelect(opp.id)}
                          style={{
                            height: 36,
                            borderRadius: 8,
                            border:
                              councilFreezeTargetId === opp.id
                                ? '2px solid #0070cc'
                                : '1px solid rgba(255,255,255,0.15)',
                            backgroundColor: councilFreezeTargetId === opp.id ? 'rgba(0,112,204,0.15)' : 'transparent',
                            color: '#f0f0f5',
                            fontSize: 13,
                            cursor: 'pointer',
                            textAlign: 'left',
                            paddingLeft: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: opp.color }} />
                          {opp.name}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: '#666680', marginTop: 8, marginBottom: 0 }}>
                      Selecting a player immediately starts the required die roll.
                    </p>
                  </div>
                )}
                <button
                  onClick={handlePlayAction}
                  disabled={currentCard.id === 'city-council-freeze'}
                  className="btn-ps"
                  style={{
                    height: 42,
                    borderRadius: 10,
                    backgroundColor: '#0070cc',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    border: '2px solid transparent',
                    cursor:
                      currentCard.id === 'city-council-freeze'
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: currentCard.id === 'city-council-freeze' ? 0.5 : 1,
                  }}
                >
                  {currentCard.id === 'city-council-freeze' ? 'Select target above' : 'Play Action'}
                </button>
                <button
                  onClick={handleCashCard}
                  style={{ height: 42, borderRadius: 10, backgroundColor: 'transparent', color: '#f0f0f5', fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}
                >
                  Cash ${currentCard.bankValue}M
                </button>
              </>
            )}
            <button
              onClick={() => setCardDialog(null)}
              style={{ height: 28, background: 'none', color: '#666680', fontSize: 12, border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

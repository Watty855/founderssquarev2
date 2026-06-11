'use client'

/**
 * Registers flight-anchor rects at each player's sidebar row — no visible fan UI.
 * Deck → hand and discard-out animations snap to these regions; summaries stay compact.
 */

import { Player } from '@/lib/types'
import { PropertyCard, ActionCard, CardInstance } from '@/lib/cardTypes'
import { propertyCards, actionCards } from '@/lib/cardData'
import { useFlightAnchorRef } from '@/hooks/use-flight-anchors'
import { handCardAnchorKey, handTargetAnchorKey } from '@/components/game/PlayerHand'

const SLOT_W = 78
const SLOT_H = 110

/** Invisible discard/draw slot — keeps last-known rects for CardFlightLayer. */
function GhostHandSlot({
  playerId,
  instanceId,
  index,
  cardGap,
}: {
  playerId: number
  instanceId: string
  index: number
  cardGap: number
}) {
  const setSlotAnchor = useFlightAnchorRef(handCardAnchorKey(playerId, instanceId))
  return (
    <div
      ref={setSlotAnchor}
      aria-hidden
      style={{
        position: 'absolute',
        bottom: 0,
        left: index * cardGap,
        width: SLOT_W,
        height: SLOT_H,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

export function SidebarHandFlightAnchors({ player }: { player: Player }) {
  const propertyCardsList = (player.propertyCards || [])
    .map((instance) => {
      const card = propertyCards.find((c) => c.id === instance.cardId)
      return card ? { ...(card as PropertyCard), instance } : null
    })
    .filter(Boolean) as (PropertyCard & { instance: CardInstance })[]

  const actionCardsList = (player.actionCards || [])
    .map((instance) => {
      const card = actionCards.find((c) => c.id === instance.cardId)
      return card ? { ...(card as ActionCard), instance } : null
    })
    .filter(Boolean) as (ActionCard & { instance: CardInstance })[]

  const setPropertyTargetAnchor = useFlightAnchorRef(handTargetAnchorKey(player.id, 'property'))
  const setActionTargetAnchor = useFlightAnchorRef(handTargetAnchorKey(player.id, 'action'))

  const propertyGap =
    propertyCardsList.length > 7 ? 10 : propertyCardsList.length > 4 ? 12 : propertyCardsList.length > 2 ? 14 : 16
  const actionGap =
    actionCardsList.length > 7 ? 10 : actionCardsList.length > 4 ? 12 : actionCardsList.length > 2 ? 14 : 16

  const propertyFanWidth =
    propertyCardsList.length > 0
      ? SLOT_W + Math.max(0, propertyCardsList.length - 1) * propertyGap
      : SLOT_W
  const actionFanWidth =
    actionCardsList.length > 0 ? SLOT_W + Math.max(0, actionCardsList.length - 1) * actionGap : SLOT_W

  const overlayH = SLOT_H + 4

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 4,
        height: overlayH,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 2,
      }}
    >
      <div
        ref={setPropertyTargetAnchor}
        style={{ position: 'absolute', left: 0, bottom: 0, width: propertyFanWidth, height: SLOT_H }}
      >
        {propertyCardsList.map((card, index) => (
          <GhostHandSlot
            key={card.instance.instanceId}
            playerId={player.id}
            instanceId={card.instance.instanceId}
            index={index}
            cardGap={propertyGap}
          />
        ))}
      </div>

      <div
        ref={setActionTargetAnchor}
        style={{ position: 'absolute', right: 0, bottom: 0, width: actionFanWidth, height: SLOT_H }}
      >
        {actionCardsList.map((card, index) => (
          <GhostHandSlot
            key={card.instance.instanceId}
            playerId={player.id}
            instanceId={card.instance.instanceId}
            index={index}
            cardGap={actionGap}
          />
        ))}
      </div>
    </div>
  )
}

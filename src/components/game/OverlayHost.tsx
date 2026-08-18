'use client'

import { useCallback } from 'react'
import { ActionCardsQuickSheet } from '@/components/game/ActionCardsQuickSheet'
import { AnchorTenetsQuickSheet } from '@/components/game/AnchorTenetsQuickSheet'
import { CardFlightLayer } from '@/components/game/CardFlightLayer'
import { OpeningProTipOverlay } from '@/components/game/OpeningProTipOverlay'
import { PropertyTypesQuickSheet } from '@/components/game/PropertyTypesQuickSheet'
import { RulesQuickSheet } from '@/components/game/RulesQuickSheet'
import {
  dismissOpeningProTip,
  setActionCardsOpen,
  setAnchorTenetsOpen,
  setOverlayCardFlights,
  setOverlayHiddenInstanceIds,
  setPropertyTypesOpen,
  setRulesQuickOpen,
  useOverlayStore,
} from '@/lib/gameOverlayStore'

export function OverlayHost() {
  const cardFlights = useOverlayStore((s) => s.cardFlights)
  const rulesQuickOpen = useOverlayStore((s) => s.rulesQuickOpen)
  const propertyTypesOpen = useOverlayStore((s) => s.propertyTypesOpen)
  const anchorTenetsOpen = useOverlayStore((s) => s.anchorTenetsOpen)
  const actionCardsOpen = useOverlayStore((s) => s.actionCardsOpen)
  const showOpeningProTip = useOverlayStore((s) => s.showOpeningProTip)

  const handleFlightDone = useCallback((flightId: string, instanceId: string | null) => {
    setOverlayCardFlights((prev) => prev.filter((f) => f.id !== flightId))
    if (instanceId) {
      setOverlayHiddenInstanceIds((s) => {
        if (!s.has(instanceId)) return s
        const next = new Set(s)
        next.delete(instanceId)
        return next
      })
    }
  }, [])

  return (
    <>
      <CardFlightLayer flights={cardFlights} onFlightDone={handleFlightDone} />
      {showOpeningProTip ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[3px]"
        >
          <OpeningProTipOverlay onSkip={dismissOpeningProTip} />
        </div>
      ) : null}
      <RulesQuickSheet open={rulesQuickOpen} onOpenChange={setRulesQuickOpen} />
      <PropertyTypesQuickSheet open={propertyTypesOpen} onOpenChange={setPropertyTypesOpen} />
      <AnchorTenetsQuickSheet open={anchorTenetsOpen} onOpenChange={setAnchorTenetsOpen} />
      <ActionCardsQuickSheet open={actionCardsOpen} onOpenChange={setActionCardsOpen} />
    </>
  )
}

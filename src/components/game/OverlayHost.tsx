'use client'

import { useCallback } from 'react'
import { ActionCardsQuickSheet } from '@/components/game/ActionCardsQuickSheet'
import { AnchorTenetsQuickSheet } from '@/components/game/AnchorTenetsQuickSheet'
import { CardFlightLayer } from '@/components/game/CardFlightLayer'
import { RulesQuickSheet } from '@/components/game/RulesQuickSheet'
import {
  setActionCardsOpen,
  setAnchorTenetsOpen,
  setOverlayCardFlights,
  setOverlayHiddenInstanceIds,
  setRulesQuickOpen,
  useOverlayStore,
} from '@/lib/gameOverlayStore'

export function OverlayHost() {
  const cardFlights = useOverlayStore((s) => s.cardFlights)
  const rulesQuickOpen = useOverlayStore((s) => s.rulesQuickOpen)
  const anchorTenetsOpen = useOverlayStore((s) => s.anchorTenetsOpen)
  const actionCardsOpen = useOverlayStore((s) => s.actionCardsOpen)

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
      <RulesQuickSheet open={rulesQuickOpen} onOpenChange={setRulesQuickOpen} />
      <AnchorTenetsQuickSheet open={anchorTenetsOpen} onOpenChange={setAnchorTenetsOpen} />
      <ActionCardsQuickSheet open={actionCardsOpen} onOpenChange={setActionCardsOpen} />
    </>
  )
}

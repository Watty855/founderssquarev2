'use client'

import { useCallback } from 'react'
import { ActionCardsQuickSheet } from '@/components/game/ActionCardsQuickSheet'
import { AnchorTenetsQuickSheet } from '@/components/game/AnchorTenetsQuickSheet'
import { CardFlightLayer } from '@/components/game/CardFlightLayer'
import { OpeningProTipOverlay } from '@/components/game/OpeningProTipOverlay'
import { PropertyTypesQuickSheet } from '@/components/game/PropertyTypesQuickSheet'
import { RulesQuickSheet } from '@/components/game/RulesQuickSheet'
import { usePlayUiStore } from '@/lib/playUiStore'
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

function CalamityScreenBanner() {
  const boardNotice = useOverlayStore((s) => s.boardNotice)
  const acceptPending = usePlayUiStore((s) => s.calamityAcceptPending)
  if (acceptPending || !boardNotice || boardNotice.tone !== 'calamity') return null
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[190] flex items-center justify-center p-3 sm:p-6"
      aria-live="polite"
      role="status"
    >
      <div
        className="max-w-[min(94vw,32rem)] rounded-xl border px-5 py-5 text-center sm:rounded-2xl sm:px-8 sm:py-7"
        style={{
          background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 42%, #7f1d1d 100%)',
          borderColor: 'rgba(254, 202, 202, 0.55)',
          boxShadow:
            '0 0 0 1px rgba(127, 29, 29, 0.9), 0 0 72px rgba(185, 28, 28, 0.72), 0 24px 48px rgba(0,0,0,0.55)',
        }}
      >
        <p
          style={{
            fontSize: 'clamp(1.35rem, 3.4vw, 2.1rem)',
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(248,250,252,0.98)',
            margin: 0,
          }}
        >
          {boardNotice.title}
        </p>
        {boardNotice.detail ? (
          <p
            style={{
              marginTop: 14,
              fontSize: 'clamp(13px, 1.8vw, 16px)',
              fontWeight: 600,
              color: 'rgba(254, 226, 226, 0.95)',
              letterSpacing: '0.01em',
              whiteSpace: 'pre-line',
              lineHeight: 1.45,
            }}
          >
            {boardNotice.detail}
          </p>
        ) : null}
      </div>
    </div>
  )
}

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
      <CalamityScreenBanner />
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

'use client'

import { useEffect, useId, useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Player } from '@/lib/types'
import { actionCards } from '@/lib/cardData'
import {
  INCOME_DIE_LEGEND_COMPACT,
  incomePercentageForDie,
  incomeRollMoodForDie,
} from '@/lib/incomeDice'
import { aiPlaybackDelay } from '@/lib/bot/aiTiming'
import { playIncomeSound } from '@/lib/soundEffects'
import { useDiceBox } from '@/hooks/use-dice-box'
import { FlatDie } from '@/components/game/FlatDie'
import { useCompactGameLayout } from '@/hooks/use-compact-game-layout'

interface IncomeDialogProps {
  open: boolean
  player: Player
  totalIncome: number
  churchIncomeBonus?: number
  churchBonusSourceLabels?: string[]
  farmCoopIncomeBonus?: number
  farmCoopBonusSourceLabels?: string[]
  portAuthorityIncomeBonus?: number
  portAuthorityBonusSourceLabels?: string[]
  artsCouncilIncomeBonus?: number
  artsCouncilBonusSourceLabels?: string[]
  tourismOfficeIncomeBonus?: number
  tourismOfficeBonusSourceLabels?: string[]
  influencersIncomeBonus?: number
  influencersBonusSourceLabels?: string[]
  mafiaIncomeBonus?: number
  mafiaBonusSourceLabels?: string[]
  /** Subtracted from rolled property income only (not when banking the Income card). */
  mafiaLevyTotal?: number
  regulationBureauIncomeBonus?: number
  regulationBureauBonusSourceLabels?: string[]
  unionIncomeBonus?: number
  unionBonusSourceLabels?: string[]
  /** −$M applied to property-income pool before the die roll (lost income; not paid to Union owner). */
  unionIncomePenalty?: number
  rivalUnionPlotLabels?: string[]
  /** True when the player has any built property — allows Income roll even if Union penalties net the pool to $0. */
  hasBuiltPropertiesForIncomeRoll?: boolean
  /**
   * When false, the player may not apply Double Income to this Income resolution (Income + Double Income
   * would exceed the per-turn action limit).
   */
  doubleIncomeAllowed?: boolean
  onComplete: (
    earnedIncome: number,
    doubleIncomeInstanceId?: string,
    incomeResolution?: 'property-roll' | 'bank-income-card',
    dieFace?: number
  ) => void
  onCancel: () => void
  aiAutoplay?: boolean
  /** When true with `aiAutoplay`, shrinks AI automation delays (fast-forward). */
  aiFastPlayback?: boolean
}

const TOUGH_TIMES_EVENTS = [
  'Unexpected medical expenses',
  'Poor stock market choices',
  'Significant gambling addictions',
  'Massive medical expenses',
  'Major equipment failure',
  'Legal fees from lawsuit',
  'Family emergency expenses',
  'Vehicle accident repairs',
  'Home repair disaster',
  'Identity theft losses',
  'Failed business venture',
  'Unexpected life events'
]

const BOOM_TIMES_EVENTS = [
  'Unexpected inheritance',
  'Excellent stock performance',
  'Surge in your local economy',
  'Local economy surge',
  'Winning business contract',
  'Real estate windfall',
  'Tech startup success',
  'Bonus from city contract',
  'Tourism boom',
  'Resource discovery',
  'Strategic partnership'
]

export function IncomeDialog({
  open,
  player,
  totalIncome,
  churchIncomeBonus = 0,
  churchBonusSourceLabels = [],
  farmCoopIncomeBonus = 0,
  farmCoopBonusSourceLabels = [],
  portAuthorityIncomeBonus = 0,
  portAuthorityBonusSourceLabels = [],
  artsCouncilIncomeBonus = 0,
  artsCouncilBonusSourceLabels = [],
  tourismOfficeIncomeBonus = 0,
  tourismOfficeBonusSourceLabels = [],
  influencersIncomeBonus = 0,
  influencersBonusSourceLabels = [],
  mafiaIncomeBonus = 0,
  mafiaBonusSourceLabels = [],
  mafiaLevyTotal = 0,
  regulationBureauIncomeBonus = 0,
  regulationBureauBonusSourceLabels = [],
  unionIncomeBonus = 0,
  unionBonusSourceLabels = [],
  unionIncomePenalty = 0,
  rivalUnionPlotLabels = [],
  hasBuiltPropertiesForIncomeRoll,
  doubleIncomeAllowed = true,
  onComplete,
  onCancel,
  aiAutoplay = false,
  aiFastPlayback = false,
}: IncomeDialogProps) {
  const instanceId = useId()
  const containerId = `dice-income-${instanceId.replace(/:/g, '')}`
  const { compact } = useCompactGameLayout()
  const preferFlatDie = compact

  const [incomeResult, setIncomeResult] = useState<{
    percentage: number
    amount: number
    status: 'tough' | 'steady' | 'boom'
    event?: string
  } | null>(null)
  const [doubleIncomeActive, setDoubleIncomeActive] = useState(false)
  const [selectedDoubleIncomeId, setSelectedDoubleIncomeId] = useState<string | null>(null)
  const [showDoubleIncomePrompt, setShowDoubleIncomePrompt] = useState(true)
  const [showInitialChoice, setShowInitialChoice] = useState(true)

  const diceOpen = open && !showInitialChoice
  const { roll, isRolling, diceValue, isReady, previewFace, usingFlatDie } = useDiceBox({
    containerId,
    open: diceOpen,
    preferFlatDie,
  })

  const doubleIncomeCards = (player?.actionCards || []).filter(instance => {
    const card = actionCards.find(c => c.id === instance.cardId)
    return card?.id === 'double-income'
  })

  const hasIncomeGeneratingProperties =
    hasBuiltPropertiesForIncomeRoll === true ||
    (hasBuiltPropertiesForIncomeRoll === undefined && totalIncome > 0)
  const bankValue = actionCards.find(c => c.id === 'income')?.bankValue ?? 4

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setIncomeResult(null)
      setDoubleIncomeActive(false)
      setSelectedDoubleIncomeId(null)
      setShowInitialChoice(true)
      const hasDoubleIncome = (player?.actionCards || []).some(instance => {
        const card = actionCards.find(c => c.id === instance.cardId)
        return card?.id === 'double-income'
      })
      setShowDoubleIncomePrompt(hasDoubleIncome && doubleIncomeAllowed)
    }
  }, [open, player, doubleIncomeAllowed])

  // Auto-roll when ready and prompts are dismissed
  useEffect(() => {
    if (!showInitialChoice && !showDoubleIncomePrompt && !isRolling && !incomeResult && hasIncomeGeneratingProperties && isReady) {
      const timer = setTimeout(
        () => roll(),
        aiAutoplay ? aiPlaybackDelay(300, aiFastPlayback) : 300
      )
      return () => clearTimeout(timer)
    }
  }, [
    showInitialChoice,
    showDoubleIncomePrompt,
    isRolling,
    incomeResult,
    hasIncomeGeneratingProperties,
    isReady,
    roll,
    aiAutoplay,
    aiFastPlayback,
  ])

  // Compute income result when dice value changes
  useEffect(() => {
    if (diceValue === null) return

    let percentage: number
    let status: 'tough' | 'steady' | 'boom'
    let event: string | undefined

    percentage = incomePercentageForDie(diceValue)
    status = incomeRollMoodForDie(diceValue)
    event =
      status === 'tough'
        ? TOUGH_TIMES_EVENTS[Math.floor(Math.random() * TOUGH_TIMES_EVENTS.length)]
        : status === 'boom'
          ? BOOM_TIMES_EVENTS[Math.floor(Math.random() * BOOM_TIMES_EVENTS.length)]
          : undefined

    let amount = Math.floor((totalIncome * percentage) / 100)
    if (doubleIncomeActive) {
      amount = amount * 2
    }
    amount = Math.max(0, amount - mafiaLevyTotal)

    setIncomeResult({ percentage, amount, status, event })
  }, [diceValue, totalIncome, doubleIncomeActive, mafiaLevyTotal])

  const aiIncomeHandledRef = useRef(false)
  const incomeAiCollectSentRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      aiIncomeHandledRef.current = false
      incomeAiCollectSentRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open || !aiAutoplay || hasIncomeGeneratingProperties || aiIncomeHandledRef.current) return
    aiIncomeHandledRef.current = true
    const t = window.setTimeout(() => {
      const bv = actionCards.find((c) => c.id === 'income')?.bankValue ?? bankValue
      playIncomeSound()
      onComplete(bv, undefined, 'bank-income-card')
    }, aiPlaybackDelay(400, aiFastPlayback))
    return () => window.clearTimeout(t)
  }, [open, aiAutoplay, aiFastPlayback, hasIncomeGeneratingProperties, bankValue, onComplete])

  useEffect(() => {
    if (!open || !aiAutoplay || !hasIncomeGeneratingProperties || !showInitialChoice) return
    const t = window.setTimeout(() => setShowInitialChoice(false), aiPlaybackDelay(400, aiFastPlayback))
    return () => window.clearTimeout(t)
  }, [open, aiAutoplay, aiFastPlayback, hasIncomeGeneratingProperties, showInitialChoice])

  useEffect(() => {
    if (!open || !aiAutoplay || showInitialChoice || !showDoubleIncomePrompt) return
    const t = window.setTimeout(() => setShowDoubleIncomePrompt(false), aiPlaybackDelay(380, aiFastPlayback))
    return () => window.clearTimeout(t)
  }, [open, aiAutoplay, aiFastPlayback, showInitialChoice, showDoubleIncomePrompt])

  useEffect(() => {
    if (!open || !aiAutoplay || !incomeResult) return
    const stamp = `${incomeResult.amount}|${selectedDoubleIncomeId ?? ''}|${incomeResult.status}`
    if (incomeAiCollectSentRef.current === stamp) return
    const amt = incomeResult.amount
    const sid = selectedDoubleIncomeId || undefined
    const t = window.setTimeout(() => {
      incomeAiCollectSentRef.current = stamp
      playIncomeSound()
      onComplete(amt, doubleIncomeAllowed ? sid : undefined, 'property-roll', diceValue ?? undefined)
    }, aiPlaybackDelay(520, aiFastPlayback))
    return () => window.clearTimeout(t)
  }, [open, aiAutoplay, aiFastPlayback, incomeResult, selectedDoubleIncomeId, doubleIncomeAllowed, onComplete, diceValue])

  const handleCollect = () => {
    if (incomeResult) {
      playIncomeSound()
      onComplete(
        incomeResult.amount,
        doubleIncomeAllowed ? selectedDoubleIncomeId || undefined : undefined,
        'property-roll',
        diceValue ?? undefined
      )
    }
  }

  const handleBankCard = () => {
    const incomeCard = actionCards.find(c => c.id === 'income')
    if (incomeCard) {
      playIncomeSound()
      onComplete(incomeCard.bankValue, undefined, 'bank-income-card')
    }
  }

  const handleProceedToRoll = () => {
    setShowInitialChoice(false)
  }

  const handleClose = () => {
    if (!isRolling) {
      onCancel()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className="max-w-[min(360px,92vw)] max-h-[min(85dvh,640px)] overflow-y-auto overscroll-contain [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <DialogHeader style={{ marginBottom: 4 }}>
          <DialogTitle style={{ fontSize: 18, fontWeight: 400 }}>
            Income — {player.name}
          </DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#8888a0', lineHeight: 1.4 }}>
            {showInitialChoice && hasIncomeGeneratingProperties
              ? `Roll the die for a chance at more income, or bank the card for a guaranteed $${bankValue}M.`
              : !hasIncomeGeneratingProperties
              ? `No properties to generate income. Bank this card for $${bankValue}M?`
              : `Property income: $${totalIncome}M`}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!hasIncomeGeneratingProperties ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleBankCard}
                className="btn-ps"
                style={{
                  flex: 1, height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                  fontSize: 14, fontWeight: 600, border: '2px solid transparent', cursor: 'pointer',
                }}
              >
                Bank Card (${bankValue}M)
              </button>
              <button
                onClick={handleClose}
                style={{
                  flex: 1, height: 42, borderRadius: 10, backgroundColor: 'transparent', color: '#f0f0f5',
                  fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {showInitialChoice && (
                <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={handleProceedToRoll}
                      className="btn-ps"
                      style={{
                        flex: 1, height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                        fontSize: 14, fontWeight: 600, border: '2px solid transparent', cursor: 'pointer',
                      }}
                    >
                      Roll Die
                    </button>
                    <button
                      onClick={handleBankCard}
                      style={{
                        flex: 1, height: 42, borderRadius: 10, backgroundColor: 'transparent', color: '#f0f0f5',
                        fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
                      }}
                    >
                      Bank (${bankValue}M)
                    </button>
                  </div>
                  <button
                    onClick={handleClose}
                    style={{ height: 28, background: 'none', color: '#666680', fontSize: 12, border: 'none', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {!showInitialChoice && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                    {usingFlatDie || preferFlatDie ? (
                      <div
                        style={{
                          width: 'min(220px, 70vw)',
                          minHeight: 120,
                          maxHeight: 160,
                          borderRadius: 10,
                          background: '#1a1a24',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 16,
                        }}
                      >
                        <FlatDie face={diceValue ?? previewFace} rolling={isRolling} size={96} />
                      </div>
                    ) : (
                      <div
                        id={containerId}
                        style={{
                          width: 'min(220px, 70vw)',
                          height: 'min(140px, 22vh)',
                          maxHeight: 160,
                          borderRadius: 10,
                          background: '#1a1a24',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      />
                    )}
                  </div>

                  <div style={{
                    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#8888a0' }}>
                        Property Income
                        {churchIncomeBonus > 0 ||
                        farmCoopIncomeBonus > 0 ||
                        portAuthorityIncomeBonus > 0 ||
                        artsCouncilIncomeBonus > 0 ||
                        tourismOfficeIncomeBonus > 0 ||
                        influencersIncomeBonus > 0 ||
                        mafiaIncomeBonus > 0 ||
                        regulationBureauIncomeBonus > 0 ||
                        unionIncomeBonus > 0 ||
                        unionIncomePenalty > 0
                          ? ' (includes anchor modifiers)'
                          : ''}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f5' }}>${totalIncome}M</span>
                    </div>
                    {churchIncomeBonus > 0 && (
                      <div
                        title={
                          churchBonusSourceLabels.length > 0
                            ? `Church Affiliation anchors at ${churchBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#fcd34d',
                          lineHeight: 1.35,
                        }}
                      >
                        Church Affiliation bonus: +${churchIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {farmCoopIncomeBonus > 0 && (
                      <div
                        title={
                          farmCoopBonusSourceLabels.length > 0
                            ? `Farm Bureau anchors at ${farmCoopBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#86efac',
                          lineHeight: 1.35,
                        }}
                      >
                        Farm Bureau bonus: +${farmCoopIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {portAuthorityIncomeBonus > 0 && (
                      <div
                        title={
                          portAuthorityBonusSourceLabels.length > 0
                            ? `Port Authority anchors at ${portAuthorityBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#93c5fd',
                          lineHeight: 1.35,
                        }}
                      >
                        Port Authority bonus: +${portAuthorityIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {artsCouncilIncomeBonus > 0 && (
                      <div
                        title={
                          artsCouncilBonusSourceLabels.length > 0
                            ? `Arts Council anchors at ${artsCouncilBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#f9a8d4',
                          lineHeight: 1.35,
                        }}
                      >
                        Arts Council bonus: +${artsCouncilIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {tourismOfficeIncomeBonus > 0 && (
                      <div
                        title={
                          tourismOfficeBonusSourceLabels.length > 0
                            ? `Tourism Office anchors at ${tourismOfficeBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#fde68a',
                          lineHeight: 1.35,
                        }}
                      >
                        Tourism Office bonus: +${tourismOfficeIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {influencersIncomeBonus > 0 && (
                      <div
                        title={
                          influencersBonusSourceLabels.length > 0
                            ? `Influencer anchors at ${influencersBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#e879f9',
                          lineHeight: 1.35,
                        }}
                      >
                        Influencer bonus: +${influencersIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {mafiaIncomeBonus > 0 && (
                      <div
                        title={
                          mafiaBonusSourceLabels.length > 0
                            ? `Mafia anchors at ${mafiaBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#fca5a5',
                          lineHeight: 1.35,
                        }}
                      >
                        Mafia block bonus: +${mafiaIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {regulationBureauIncomeBonus > 0 && (
                      <div
                        title={
                          regulationBureauBonusSourceLabels.length > 0
                            ? `Regulation Bureau anchors at ${regulationBureauBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#a5b4fc',
                          lineHeight: 1.35,
                        }}
                      >
                        Regulation Bureau bonus: +${regulationBureauIncomeBonus}M across covered city block lots.
                      </div>
                    )}
                    {unionIncomeBonus > 0 && (
                      <div
                        title={
                          unionBonusSourceLabels.length > 0
                            ? `Union anchors at ${unionBonusSourceLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#94a3b8',
                          lineHeight: 1.35,
                        }}
                      >
                        Union block bonus: +${unionIncomeBonus}M on your other lots sharing your Union anchor block(s).
                      </div>
                    )}
                    {unionIncomePenalty > 0 && (
                      <div
                        title={
                          rivalUnionPlotLabels.length > 0
                            ? `Active rival Union anchor(s) at ${rivalUnionPlotLabels.join(', ')}`
                            : undefined
                        }
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#cbd5e1',
                          lineHeight: 1.35,
                        }}
                      >
                        Union pressure: −${unionIncomePenalty}M on your lots in rivals’ Union city blocks (lost income).
                      </div>
                    )}
                    {mafiaLevyTotal > 0 && (
                      <div
                        style={{
                          marginBottom: 6,
                          fontSize: 11,
                          color: '#f87171',
                          lineHeight: 1.35,
                        }}
                      >
                        Mafia tribute (owed on this roll): −${mafiaLevyTotal}M from your payout to opponent(s).
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#666680' }}>
                      {INCOME_DIE_LEGEND_COMPACT}
                    </div>
                    {doubleIncomeActive && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1eaedb', paddingTop: 8, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        Double Income Active
                      </div>
                    )}
                  </div>
                </>
              )}

              {!showInitialChoice && !incomeResult && showDoubleIncomePrompt && doubleIncomeCards.length > 0 && (
                <div className="animate-fadeIn" style={{
                  background: 'linear-gradient(135deg, rgba(30,174,219,0.12), rgba(30,174,219,0.04))',
                  borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(30,174,219,0.3)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1eaedb', marginBottom: 4 }}>
                    Play Double Income Card?
                  </div>
                  <p style={{ fontSize: 11, color: '#8888a0', marginBottom: 10, lineHeight: 1.4 }}>
                    Applies to <strong>this</strong> Income resolution only: if you use it, your final collection after
                    the die roll is doubled. Double Income must be played together with Income in the same play to
                    double a payout elsewhere; by itself it only banks for cash value.
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => {
                        setDoubleIncomeActive(true)
                        setSelectedDoubleIncomeId(doubleIncomeCards[0].instanceId)
                        setShowDoubleIncomePrompt(false)
                      }}
                      className="btn-ps"
                      style={{
                        flex: 1, height: 36, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                        fontSize: 13, fontWeight: 600, border: '2px solid transparent', cursor: 'pointer',
                      }}
                    >
                      Play It
                    </button>
                    <button
                      onClick={() => setShowDoubleIncomePrompt(false)}
                      style={{
                        flex: 1, height: 36, borderRadius: 10, backgroundColor: 'transparent', color: '#f0f0f5',
                        fontSize: 13, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {!showInitialChoice && diceValue !== null && (
                <div style={{ textAlign: 'center', fontSize: 32, fontWeight: 300, color: '#1eaedb', padding: '8px 0' }} className="animate-fadeIn">
                  Rolled: {diceValue}
                </div>
              )}

              {!showInitialChoice && incomeResult && (
                <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    borderRadius: 10, padding: '16px 14px', textAlign: 'center',
                    backgroundColor: incomeResult.status === 'tough' ? 'rgba(200,27,58,0.15)'
                      : incomeResult.status === 'boom' ? 'rgba(30,174,219,0.15)'
                      : 'rgba(0,112,204,0.15)',
                    border: `1px solid ${
                      incomeResult.status === 'tough' ? 'rgba(200,27,58,0.5)'
                      : incomeResult.status === 'boom' ? 'rgba(30,174,219,0.5)'
                      : 'rgba(0,112,204,0.5)'
                    }`,
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#f0f0f5' }}>
                      {incomeResult.status === 'tough' && 'Tough Times'}
                      {incomeResult.status === 'steady' && 'Steady Growth'}
                      {incomeResult.status === 'boom' && 'Boom Times!'}
                    </div>
                    <div style={{ fontSize: 13, color: '#8888a0', marginBottom: 2 }}>
                      {incomeResult.percentage}% income
                    </div>
                    {incomeResult.event && (
                      <div style={{ fontSize: 12, fontStyle: 'italic', color: '#666680', marginBottom: 8 }}>
                        {incomeResult.event}
                      </div>
                    )}
                    {churchIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#fcd34d',
                          marginBottom: 8,
                        }}
                      >
                        Church bonus included: +${churchIncomeBonus}M
                      </div>
                    )}
                    {farmCoopIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#86efac',
                          marginBottom: 8,
                        }}
                      >
                        Farm Bureau bonus included: +${farmCoopIncomeBonus}M
                      </div>
                    )}
                    {portAuthorityIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#93c5fd',
                          marginBottom: 8,
                        }}
                      >
                        Port Authority bonus included: +${portAuthorityIncomeBonus}M
                      </div>
                    )}
                    {artsCouncilIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#f9a8d4',
                          marginBottom: 8,
                        }}
                      >
                        Arts Council bonus included: +${artsCouncilIncomeBonus}M
                      </div>
                    )}
                    {tourismOfficeIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#fde68a',
                          marginBottom: 8,
                        }}
                      >
                        Tourism Office bonus included: +${tourismOfficeIncomeBonus}M
                      </div>
                    )}
                    {influencersIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#e879f9',
                          marginBottom: 8,
                        }}
                      >
                        Influencer bonus included: +${influencersIncomeBonus}M
                      </div>
                    )}
                    {mafiaIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#fca5a5',
                          marginBottom: 8,
                        }}
                      >
                        Mafia block bonus included: +${mafiaIncomeBonus}M
                      </div>
                    )}
                    {regulationBureauIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#a5b4fc',
                          marginBottom: 8,
                        }}
                      >
                        Regulation Bureau bonus included: +${regulationBureauIncomeBonus}M
                      </div>
                    )}
                    {unionIncomeBonus > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#94a3b8',
                          marginBottom: 8,
                        }}
                      >
                        Union block bonus included: +${unionIncomeBonus}M
                      </div>
                    )}
                    {unionIncomePenalty > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#cbd5e1',
                          marginBottom: 8,
                        }}
                      >
                        Union pressure applied before roll: −${unionIncomePenalty}M
                      </div>
                    )}
                    {mafiaLevyTotal > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#f87171',
                          marginBottom: 8,
                        }}
                      >
                        Mafia tribute deducted: −${mafiaLevyTotal}M
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: '#8888a0', marginBottom: 2 }}>You receive</div>
                      <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 300, color: '#1eaedb' }}>
                        ${incomeResult.amount}M
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCollect}
                    className="btn-ps"
                    style={{
                      position: 'sticky',
                      bottom: 0,
                      zIndex: 2,
                      height: 48,
                      width: '100%',
                      borderRadius: 10,
                      backgroundColor: '#0070cc',
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 700,
                      border: '2px solid transparent',
                      cursor: 'pointer',
                      boxShadow: '0 -12px 24px #141418',
                      marginTop: 4,
                    }}
                  >
                    Collect Income
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useId, useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useDiceBox } from '@/hooks/use-dice-box'
import { XCircle } from '@phosphor-icons/react'
import { actionCards } from '@/lib/cardData'
import { playCrowdCheerSound } from '@/lib/soundEffects'

export type RollDieDialogMode =
  | 'roll-die'
  | 'council-freeze-attacker'
  | 'council-freeze-defender'
  | 'hostile-takeover-attacker'
  | 'hostile-takeover-defender'
  | 'scandal-attacker'
  | 'scandal-defender'
  | 'rezoning'
  | 'police-raid-attacker'
  | 'police-raid-defender'
  | 'remove-investors'

interface RollDieDialogProps {
  open: boolean
  onComplete: (result: number) => void
  onCancel: () => void
  mode?: RollDieDialogMode
  /** Natural die + this value for City Council Freeze attacker check */
  influenceBonus?: number
  /** e.g. ["City Hall"] — used in copy when bonus &gt; 0 */
  influenceLabels?: string[]
  /** Defender / generic context name */
  defenderName?: string
  /** Player rolling the attacker die (shown on City Council intro like Income — player) */
  actingPlayerName?: string
  /** Completed attacker rolls this freeze attempt; 3rd failed roll triggers auto-fail UI */
  councilFreezeAttackerRollsCompleted?: number
  /** Current player's cash — for enabling paid retries */
  attackerMoney?: number
  /** After 3rd failed roll: show brief "City Council fails" then call onCouncilFreezeFailDismiss */
  councilFreezeFailAuto?: boolean
  /** Incremented by parent after a paid retry so the die UI resets */
  diceRetryNonce?: number
  onAttackerDieSettled?: (natural: number) => void
  /** Parent deducts $5M when appropriate and bumps diceRetryNonce; dialog then resets */
  onCouncilFreezeAttackerRollAgain?: () => void
  onCouncilFreezeFailDismiss?: () => void
  /** Hostile Takeover attacker: show the $1M payment and target before the die is rolled */
  hostileTakeoverExchange?: {
    attackerName: string
    ownerName: string
    plotLabel: string
    buildingName: string
  }
  /** Rezoning: chosen build template and lot (cost is paid only if the roll succeeds). */
  rezoningSummary?: {
    propertyName: string
    plotLabel: string
    buildCostMillion: number
  }
  /** Scandal: targeted built anchor and lot. */
  scandalSummary?: {
    anchorName: string
    plotLabel: string
    ownerName: string
  }
  /** AI player: dismiss intros and Continue without clicks (uses dice results). */
  aiAutoplay?: boolean
}

export function RollDieDialog(props: RollDieDialogProps) {
  return <RollDieDialogInner {...props} />
}

function RollDieDialogInner({
  open,
  onComplete,
  onCancel,
  mode = 'roll-die',
  influenceBonus = 0,
  influenceLabels = [],
  defenderName,
  actingPlayerName,
  councilFreezeAttackerRollsCompleted = 0,
  attackerMoney = 0,
  councilFreezeFailAuto = false,
  diceRetryNonce = 0,
  onAttackerDieSettled,
  onCouncilFreezeAttackerRollAgain,
  onCouncilFreezeFailDismiss,
  hostileTakeoverExchange,
  rezoningSummary,
  scandalSummary,
  aiAutoplay = false,
}: RollDieDialogProps) {
  const instanceId = useId()
  const containerId = `dice-roll-${instanceId.replace(/:/g, '')}-${mode}`
  const councilFreezeFlow = mode === 'council-freeze-attacker' || mode === 'council-freeze-defender'
  const councilFreezeBankValue = actionCards.find((c) => c.id === 'city-council-freeze')?.bankValue ?? 2

  const [showCouncilFreezeIntro, setShowCouncilFreezeIntro] = useState(true)
  const diceBoxOpen = open && (!councilFreezeFlow || !showCouncilFreezeIntro)
  const showNonIntroDiceUi = !councilFreezeFlow || !showCouncilFreezeIntro

  const { roll, isRolling, diceValue, reset, isReady } = useDiceBox({ containerId, open: diceBoxOpen })

  const takeoverFlow = mode === 'hostile-takeover-attacker' || mode === 'hostile-takeover-defender'
  const scandalFlow = mode === 'scandal-attacker' || mode === 'scandal-defender'
  const rezoningFlow = mode === 'rezoning'
  const policeRaidFlow = mode === 'police-raid-attacker' || mode === 'police-raid-defender'
  const removeInvestorsFlow = mode === 'remove-investors'

  useEffect(() => {
    if (open && councilFreezeFlow) {
      setShowCouncilFreezeIntro((diceRetryNonce ?? 0) === 0)
    }
  }, [open, mode, councilFreezeFlow, diceRetryNonce])

  useEffect(() => {
    if (mode !== 'council-freeze-attacker') return
    if (diceRetryNonce === undefined || diceRetryNonce <= 0) return
    reset()
  }, [diceRetryNonce, mode, reset])

  useEffect(() => {
    if (!councilFreezeFailAuto || !open) return
    const t = window.setTimeout(() => {
      onCouncilFreezeFailDismiss?.()
    }, 2400)
    return () => window.clearTimeout(t)
  }, [councilFreezeFailAuto, open, onCouncilFreezeFailDismiss])

  const runAttackerRoll = useCallback(async () => {
    const v = await roll()
    if (v >= 1 && v <= 6) {
      onAttackerDieSettled?.(v)
    }
  }, [roll, onAttackerDieSettled])

  useEffect(() => {
    if (!open || !councilFreezeFlow || showCouncilFreezeIntro || councilFreezeFailAuto) return
    if (isRolling || diceValue !== null || !isReady) return
    const t = window.setTimeout(() => {
      if (mode === 'council-freeze-attacker') void runAttackerRoll()
      else void roll()
    }, 300)
    return () => window.clearTimeout(t)
  }, [
    open,
    councilFreezeFlow,
    showCouncilFreezeIntro,
    councilFreezeFailAuto,
    isRolling,
    diceValue,
    isReady,
    mode,
    roll,
    runAttackerRoll,
  ])

  useEffect(() => {
    if (!open || !aiAutoplay || !councilFreezeFlow || !showCouncilFreezeIntro) return
    const t = window.setTimeout(() => setShowCouncilFreezeIntro(false), 400)
    return () => window.clearTimeout(t)
  }, [open, aiAutoplay, councilFreezeFlow, showCouncilFreezeIntro])

  const councilFreezeIntroTitle =
    mode === 'council-freeze-attacker'
      ? `City Council Freeze — ${actingPlayerName ?? 'You'}`
      : `City Council Freeze — ${defenderName ?? 'Player'}`

  const targetLabel = defenderName ?? 'the target player'
  const councilFreezeIntroDescription =
    mode === 'council-freeze-attacker'
      ? `Roll when you are ready to resolve your play against ${targetLabel}. First roll is free; each extra roll costs $5M (up to three).`
      : `Roll once when you are ready. A 6 negates the freeze; any other result applies it.`

  const title =
    mode === 'council-freeze-attacker'
      ? 'City Council Freeze — your roll'
      : mode === 'council-freeze-defender'
        ? 'City Council Freeze — defender roll'
        : mode === 'hostile-takeover-attacker'
          ? 'Hostile Takeover — your roll'
          : mode === 'hostile-takeover-defender'
            ? 'Hostile Takeover — defender roll'
            : mode === 'scandal-attacker'
              ? 'Scandal — your roll'
              : mode === 'scandal-defender'
                ? 'Scandal — anchor owner roll'
                : mode === 'rezoning'
                  ? 'Rezoning — roll required'
                  : mode === 'police-raid-attacker'
                    ? 'Police Raid on Mafia — your roll'
                    : mode === 'police-raid-defender'
                      ? 'Police Raid on Mafia — Mafia counter roll'
                      : mode === 'remove-investors'
                        ? 'Remove Investors — roll required'
                        : 'Roll Die'

  const description =
    mode === 'council-freeze-attacker'
      ? 'Roll the die. Total 5–6 after civic influence succeeds (+1 max if you own built City Hall and/or Courthouse anywhere). First roll is free; each extra roll costs $5M (up to 3 rolls). If all three miss, the freeze fails.'
      : mode === 'council-freeze-defender'
        ? `${defenderName ?? 'The target player'} rolls once. A 6 negates the freeze.`
        : mode === 'hostile-takeover-attacker'
          ? 'The die must be rolled to resolve the attempt. Anchor takeover modifiers apply using only the target property’s city block (natural roll + bonuses: 5–6 succeeds). 1–4 before bonuses fails if bonuses cannot reach 5+. On success, the owner rolls once — only a 6 blocks; otherwise you pay 120% of end value and the lot becomes yours.'
          : mode === 'hostile-takeover-defender'
            ? `${defenderName ?? 'The property owner'} rolls once. A 6 blocks the takeover and keeps the property.`
            : mode === 'scandal-attacker'
              ? 'Roll the die. Total 6+ succeeds (max +1 from owning built Influencer and/or News Outlet — they do not stack). On success, the anchor owner rolls once — only a 6 negates; otherwise that anchor’s passive influence is discontinued on this lot.'
              : mode === 'scandal-defender'
                ? `${defenderName ?? 'The anchor owner'} rolls once. A 6 negates the scandal; any other result discontinues this anchor’s influence on this lot.`
                : mode === 'rezoning'
                  ? 'Roll 5–6 to approve Rezoning. Max +1 civic influence applies board-wide — any built civic you own anywhere lets natural 4–6 succeed. On 1–3 without that bonus (or lower totals), zoning stays the same, Rezoning is discarded, and this build fails on that lot.'
                  : mode === 'police-raid-attacker'
                    ? 'Roll the die. Total 5+ succeeds (including max +1 raid influence when you own built Police, City Hall, and/or Courthouse anywhere). On success, the Mafia owner counters — they need 6 if you had no raid influence, or 5–6 if you did.'
                    : mode === 'police-raid-defender'
                      ? `${defenderName ?? 'The Mafia owner'} rolls once to counter. ${influenceBonus > 0 ? 'They need 5–6 because you had raid influence (+1).' : 'They need a 6.'}`
                      : mode === 'remove-investors'
                        ? 'Roll the die. Total 5+ counts your natural roll plus anchor and civic influence from your city block around the property you selected. No investor counter-roll. If you succeed, pay each investor 50% of their contribution ($M), then all stripes on that lot are cleared. Below 5 — investors stay and this card is discarded.'
                        : 'Click to roll and see your result'

  const total =
    diceValue !== null ? diceValue + influenceBonus : null
  const attackerSuccess = mode === 'council-freeze-attacker' && total !== null && total >= 5
  const attackerFail = mode === 'council-freeze-attacker' && total !== null && total < 5

  const hostileTakeoverTotal =
    mode === 'hostile-takeover-attacker' && diceValue !== null ? diceValue + influenceBonus : null
  const hostileTakeoverAttackerSuccess =
    mode === 'hostile-takeover-attacker' && hostileTakeoverTotal !== null && hostileTakeoverTotal >= 5
  const hostileTakeoverAttackerFail =
    mode === 'hostile-takeover-attacker' && hostileTakeoverTotal !== null && hostileTakeoverTotal < 5

  const scandalAttackerTotal =
    mode === 'scandal-attacker' && diceValue !== null ? diceValue + influenceBonus : null
  const scandalAttackerSuccess =
    mode === 'scandal-attacker' && scandalAttackerTotal !== null && scandalAttackerTotal >= 6
  const scandalAttackerFail =
    mode === 'scandal-attacker' && scandalAttackerTotal !== null && scandalAttackerTotal < 6

  const rezoningRollSuccess = mode === 'rezoning' && total !== null && total >= 5
  const rezoningRollFail = mode === 'rezoning' && total !== null && total < 5

  /** Police Raid: Mafia counters on 6, or on 5–6 when attacker had any raid influence (+1 from Police/City Hall/Courthouse). */
  const policeRaidCounterThreshold = influenceBonus > 0 ? 5 : 6
  const policeRaidAttackerTotal =
    mode === 'police-raid-attacker' && diceValue !== null ? diceValue + influenceBonus : null
  const policeRaidAttackerSuccess =
    mode === 'police-raid-attacker' && policeRaidAttackerTotal !== null && policeRaidAttackerTotal >= 5
  const policeRaidAttackerFail =
    mode === 'police-raid-attacker' && policeRaidAttackerTotal !== null && policeRaidAttackerTotal < 5

  const removeInvestorsTotal =
    mode === 'remove-investors' && diceValue !== null ? diceValue + influenceBonus : null
  const removeInvestorsSuccess =
    mode === 'remove-investors' && removeInvestorsTotal !== null && removeInvestorsTotal >= 5
  const removeInvestorsFail =
    mode === 'remove-investors' && removeInvestorsTotal !== null && removeInvestorsTotal < 5

  const canAffordRetry = attackerMoney >= 5

  // Crowd cheer once per winning roll
  const anyWinningRoll =
    attackerSuccess ||
    hostileTakeoverAttackerSuccess ||
    scandalAttackerSuccess ||
    rezoningRollSuccess ||
    policeRaidAttackerSuccess ||
    removeInvestorsSuccess
  useEffect(() => {
    if (open && anyWinningRoll) playCrowdCheerSound()
  }, [open, anyWinningRoll])

  const showGenericRollAgain =
    mode === 'roll-die' && diceValue !== null

  const showAttackerFailChoices =
    mode === 'council-freeze-attacker' &&
    attackerFail &&
    !councilFreezeFailAuto &&
    councilFreezeAttackerRollsCompleted < 3

  const singleContinueAfterRoll =
    mode === 'council-freeze-defender' ||
    mode === 'hostile-takeover-defender' ||
    mode === 'scandal-defender' ||
    (mode === 'council-freeze-attacker' && attackerSuccess) ||
    (mode === 'hostile-takeover-attacker' && diceValue !== null) ||
    (mode === 'scandal-attacker' && diceValue !== null) ||
    (mode === 'rezoning' && diceValue !== null) ||
    (policeRaidFlow && diceValue !== null) ||
    (removeInvestorsFlow && diceValue !== null)

  const suppressBackdropDismiss =
    councilFreezeFailAuto || takeoverFlow || scandalFlow || rezoningFlow || policeRaidFlow || removeInvestorsFlow

  useEffect(() => {
    if (!open || !aiAutoplay || diceValue === null || councilFreezeFailAuto) return

    const shouldAdvance =
      showAttackerFailChoices || showGenericRollAgain || singleContinueAfterRoll

    if (!shouldAdvance) return

    const v = diceValue
    const t = window.setTimeout(() => onComplete(v), 520)
    return () => window.clearTimeout(t)
  }, [
    open,
    aiAutoplay,
    diceValue,
    councilFreezeFailAuto,
    showAttackerFailChoices,
    showGenericRollAgain,
    singleContinueAfterRoll,
    onComplete,
  ])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !suppressBackdropDismiss && onCancel()}>
      {/**
       * IMPORTANT: do NOT pass `position: 'relative'` (or any other `position` value) in the inline `style`
       * here — the underlying Radix DialogContent relies on its own `position: fixed` (with translate-based
       * centering) coming in from `className`, and inline styles win over class styles. Setting a position
       * on this element pushes the dialog into document flow and it visually disappears while still being
       * in the DOM. The auto-fail overlay below uses `position: absolute` and anchors to this fixed parent,
       * which is enough — no `position: relative` needed on the dialog itself.
       */}
      <DialogContent
        className="max-w-[min(360px,92vw)] max-h-[min(85dvh,640px)] overflow-y-auto overscroll-contain [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        {councilFreezeFailAuto && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              textAlign: 'center',
              backgroundColor: 'rgba(20,20,24,0.97)',
            }}
          >
            <XCircle weight="duotone" size={56} color="#f87171" style={{ opacity: 0.95 }} />
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#fecaca', letterSpacing: '0.02em' }}>
              City Council fails
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#a8a8b8', maxWidth: 280, lineHeight: 1.45 }}>
              Three rolls without reaching 5–6 after influence. This window will close automatically.
            </p>
          </div>
        )}

        <DialogHeader style={{ marginBottom: 4 }}>
          <DialogTitle style={{ fontSize: 18, fontWeight: 400 }}>
            {councilFreezeFlow && showCouncilFreezeIntro ? councilFreezeIntroTitle : title}
          </DialogTitle>
          <DialogDescription
            style={{ fontSize: 13, color: '#8888a0', ...(councilFreezeFlow && showCouncilFreezeIntro ? { lineHeight: 1.4 } : {}) }}
          >
            {councilFreezeFlow && showCouncilFreezeIntro ? councilFreezeIntroDescription : description}
          </DialogDescription>
        </DialogHeader>

        <>
            {councilFreezeFlow && showCouncilFreezeIntro && (
              <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowCouncilFreezeIntro(false)}
                    className="btn-ps"
                    style={{
                      flex: 1,
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
                    Roll Die
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Bank only if you have not started this resolution — finish or cancel the dialog."
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 10,
                      backgroundColor: 'transparent',
                      color: 'rgba(240,240,245,0.35)',
                      fontSize: 14,
                      fontWeight: 500,
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'not-allowed',
                      opacity: 0.55,
                    }}
                  >
                    Bank (${councilFreezeBankValue}M)
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    height: 28,
                    background: 'none',
                    color: '#666680',
                    fontSize: 12,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {showNonIntroDiceUi && (
            <>
            {mode === 'hostile-takeover-attacker' && hostileTakeoverExchange && (
              <div
                role="status"
                style={{
                  marginBottom: 14,
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    color: '#fcd34d',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Exchange
                </p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(248, 250, 252, 0.95)' }}>
                  <strong>{hostileTakeoverExchange.attackerName}</strong> paid <strong>$1M</strong> to{' '}
                  <strong>{hostileTakeoverExchange.ownerName}</strong> for the Hostile Takeover attempt on{' '}
                  <strong>{hostileTakeoverExchange.buildingName}</strong> at{' '}
                  <strong>{hostileTakeoverExchange.plotLabel}</strong>.
                </p>
                {diceValue === null && (
                  <p
                    style={{
                      margin: '12px 0 0',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fb923c',
                      lineHeight: 1.45,
                    }}
                  >
                    The die must be rolled — there is no outcome until you roll.
                  </p>
                )}
              </div>
            )}
            {mode === 'scandal-attacker' && scandalSummary && diceValue === null && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(232, 121, 249, 0.45)',
                  backgroundColor: 'rgba(232, 121, 249, 0.08)',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    color: '#e879f9',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Scandal target
                </p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(248, 250, 252, 0.95)' }}>
                  Discontinue <strong>{scandalSummary.anchorName}</strong> at <strong>{scandalSummary.plotLabel}</strong>{' '}
                  (owned by <strong>{scandalSummary.ownerName}</strong>).                   Roll required: <strong>6+</strong> after scandal bonuses (max +1 from Influencer / News Outlet combined).
                </p>
              </div>
            )}
            {mode === 'rezoning' && rezoningSummary && diceValue === null && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(167, 139, 250, 0.4)',
                  backgroundColor: 'rgba(124, 58, 237, 0.1)',
                }}
              >
                <p
                  style={{
                    margin: '0 0 6px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#c4b5fd',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Rezoning request
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'rgba(248, 250, 252, 0.92)' }}>
                  Build <strong>{rezoningSummary.propertyName}</strong> at <strong>{rezoningSummary.plotLabel}</strong> for{' '}
                  <strong>${rezoningSummary.buildCostMillion}M</strong> if the roll succeeds.
                </p>
                <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 600, color: '#a78bfa', lineHeight: 1.45 }}>
                  Roll required: 5–6 succeeds, or 4–6 with max +1 board-wide civic influence.
                </p>
              </div>
            )}
            {mode === 'council-freeze-attacker' && influenceBonus > 0 && influenceLabels.length > 0 && (
              <p style={{ fontSize: 12, color: '#1eaedb', marginBottom: 8, lineHeight: 1.4 }}>
                +{influenceBonus} influence on this roll from built {influenceLabels.join(' & ')} anywhere on the board (max +1).
              </p>
            )}
            {mode === 'rezoning' && influenceBonus > 0 && influenceLabels.length > 0 && (
              <p style={{ fontSize: 12, color: '#1eaedb', marginBottom: 8, lineHeight: 1.4 }}>
                +{influenceBonus} influence on this roll from built civic anywhere on the board (max +1):{' '}
                {influenceLabels.join(' & ')}.
              </p>
            )}
            {mode === 'scandal-attacker' && influenceBonus > 0 && influenceLabels.length > 0 && (
              <p style={{ fontSize: 12, color: '#e879f9', marginBottom: 8, lineHeight: 1.4 }}>
                +{influenceBonus} on this scandal roll from {influenceLabels.join(' & ')}.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <div
                id={containerId}
                style={{
                  width: 'min(220px, 70vw)',
                  height: 'min(140px, 22vh)',
                  borderRadius: 10,
                  background: '#1a1a24',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {diceValue !== null && (
                <div style={{ textAlign: 'center', fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 300, color: '#1eaedb', padding: '6px 0' }}>
                  You rolled: {diceValue}
                  {(mode === 'council-freeze-attacker' || mode === 'rezoning') && influenceBonus > 0 && (
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'rgba(240,240,245,0.75)', marginTop: 8 }}>
                      + {influenceBonus} civic influence → total {total}
                    </div>
                  )}
                  {mode === 'scandal-attacker' && influenceBonus > 0 && (
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'rgba(240,240,245,0.75)', marginTop: 8 }}>
                      + {influenceBonus}
                      {influenceLabels.length > 0 ? ` (${influenceLabels.join(' + ')})` : ''} → total {scandalAttackerTotal}
                    </div>
                  )}
                </div>
              )}

              {mode === 'council-freeze-attacker' && attackerSuccess && (
                <p style={{ textAlign: 'center', fontSize: 13, color: '#6ee7b7', margin: 0 }}>
                  Total {total}: success — a 5–6 after influence invokes City Council Freeze. The target may still roll a 6
                  to negate.
                </p>
              )}
              {mode === 'council-freeze-attacker' && attackerFail && !councilFreezeFailAuto && (
                <p style={{ textAlign: 'center', fontSize: 13, color: '#fca5a5', margin: 0 }}>
                  Total {total}: need 5–6 after influence.
                  {councilFreezeAttackerRollsCompleted < 3 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#a8a8b8' }}>
                      {councilFreezeAttackerRollsCompleted < 2
                        ? 'Use Roll again ($5M) for another try, or accept failure.'
                        : 'One paid roll ($5M) remains — then City Council fails if you miss.'}
                    </span>
                  )}
                </p>
              )}
              {hostileTakeoverAttackerSuccess && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#6ee7b7', margin: 0 }}>
                  Successful Take Over.
                  {hostileTakeoverTotal !== null && influenceBonus > 0 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: '#86efac' }}>
                      {diceValue} + {influenceBonus} influence = {hostileTakeoverTotal}
                    </span>
                  )}
                </p>
              )}
              {hostileTakeoverAttackerFail && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#fca5a5', margin: 0 }}>
                  Unsuccessful Take Over.
                  {hostileTakeoverTotal !== null && influenceBonus > 0 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: '#fca5a5' }}>
                      {diceValue} + {influenceBonus} influence = {hostileTakeoverTotal}
                    </span>
                  )}
                </p>
              )}
              {scandalAttackerSuccess && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#6ee7b7', margin: 0 }}>
                  Scandal roll succeeds.
                  {scandalAttackerTotal !== null && influenceBonus > 0 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: '#86efac' }}>
                      {diceValue} + {influenceBonus} = {scandalAttackerTotal}
                    </span>
                  )}
                </p>
              )}
              {scandalAttackerFail && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#fca5a5', margin: 0 }}>
                  Scandal misses — need 6+ after scandal bonuses.
                  {scandalAttackerTotal !== null && influenceBonus > 0 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: '#fca5a5' }}>
                      {diceValue} + {influenceBonus} = {scandalAttackerTotal}
                    </span>
                  )}
                </p>
              )}
              {rezoningRollSuccess && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#6ee7b7', margin: 0 }}>
                  Rezoning approved. Build now resolves at {rezoningSummary?.plotLabel ?? 'the lot'} for $
                  {rezoningSummary?.buildCostMillion ?? '—'}M, and that card's stats now apply on this lot.
                </p>
              )}
              {rezoningRollFail && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#fca5a5', margin: 0 }}>
                  Rezoning denied — zoning unchanged. This build fails on that lot and Rezoning is discarded.
                </p>
              )}
              {policeRaidAttackerSuccess && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#6ee7b7', margin: 0 }}>
                  Police Raid succeeds.
                  {policeRaidAttackerTotal !== null && influenceBonus > 0 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: '#86efac' }}>
                      {diceValue} + {influenceBonus} raid influence = {policeRaidAttackerTotal}
                    </span>
                  )}
                </p>
              )}
              {policeRaidAttackerFail && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#fca5a5', margin: 0 }}>
                  Police Raid fails — need 5+ total (natural roll plus raid influence).
                </p>
              )}
              {mode === 'police-raid-defender' && diceValue !== null && (
                <p style={{ textAlign: 'center', fontSize: 13, color: diceValue >= policeRaidCounterThreshold ? '#6ee7b7' : '#fca5a5', margin: 0 }}>
                  {diceValue >= policeRaidCounterThreshold
                    ? `Rolled ${diceValue} — Mafia counters (${policeRaidCounterThreshold}+ needed). Police Raid fails.`
                    : `Rolled ${diceValue} — below ${policeRaidCounterThreshold}; Mafia could not counter.`}
                </p>
              )}
              {removeInvestorsSuccess && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#6ee7b7', margin: 0 }}>
                  Investors will be removed — you pay each investor 50% of their stake.
                  {removeInvestorsTotal !== null && influenceBonus > 0 && (
                    <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: '#86efac' }}>
                      {diceValue} + {influenceBonus} block influence = {removeInvestorsTotal}
                    </span>
                  )}
                </p>
              )}
              {removeInvestorsFail && (
                <p style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#fca5a5', margin: 0 }}>
                  Need 5+ after influence — rolled {removeInvestorsTotal ?? diceValue}. Investors stay; Remove Investors is discarded.
                </p>
              )}
              {mode === 'council-freeze-defender' && diceValue !== null && (
                <p style={{ textAlign: 'center', fontSize: 13, color: diceValue === 6 ? '#6ee7b7' : '#fca5a5', margin: 0 }}>
                  {diceValue === 6
                    ? 'Rolled 6 — freeze negated.'
                    : `Rolled ${diceValue} — freeze stands (only a 6 negates).`}
                </p>
              )}
              {mode === 'hostile-takeover-defender' && diceValue !== null && (
                <p style={{ textAlign: 'center', fontSize: 13, color: diceValue === 6 ? '#6ee7b7' : '#fca5a5', margin: 0 }}>
                  {diceValue === 6
                    ? 'Rolled 6 — takeover blocked. The property stays with its owner.'
                    : `Rolled ${diceValue} — takeover completes (only a 6 blocks).`}
                </p>
              )}
              {mode === 'scandal-defender' && diceValue !== null && (
                <p style={{ textAlign: 'center', fontSize: 13, color: diceValue === 6 ? '#6ee7b7' : '#fca5a5', margin: 0 }}>
                  {diceValue === 6
                    ? 'Rolled 6 — scandal negated. The anchor keeps its influence.'
                    : `Rolled ${diceValue} — scandal applies (only a 6 negates).`}
                </p>
              )}

              {diceValue === null ? (
                <button
                  onClick={() => {
                    if (mode === 'council-freeze-attacker') void runAttackerRoll()
                    else void roll()
                  }}
                  disabled={isRolling || !isReady}
                  className="btn-ps"
                  style={{
                    height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                    fontSize: 14, fontWeight: 600, border: '2px solid transparent',
                    cursor: isRolling || !isReady ? 'not-allowed' : 'pointer',
                    opacity: isRolling || !isReady ? 0.6 : 1,
                  }}
                >
                  {isRolling
                    ? 'Rolling...'
                    : !isReady
                      ? 'Loading...'
                      : takeoverFlow ||
                          scandalFlow ||
                          rezoningFlow ||
                          policeRaidFlow ||
                          removeInvestorsFlow
                        ? 'Roll the die'
                        : 'Roll Die'}
                </button>
              ) : singleContinueAfterRoll ? (
                <button
                  onClick={() => diceValue !== null && onComplete(diceValue)}
                  className="btn-ps"
                  style={{
                    width: '100%', height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                    fontSize: 14, fontWeight: 600, border: '2px solid transparent', cursor: 'pointer',
                  }}
                >
                  Continue
                </button>
              ) : showAttackerFailChoices ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => diceValue !== null && onComplete(diceValue)}
                    style={{
                      height: 36, borderRadius: 10, backgroundColor: 'transparent', color: 'rgba(240,240,245,0.65)',
                      fontSize: 13, fontWeight: 500, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                    }}
                  >
                    Accept failure
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canAffordRetry) return
                      onCouncilFreezeAttackerRollAgain?.()
                    }}
                    disabled={!canAffordRetry}
                    className="btn-ps"
                    style={{
                      height: 44, borderRadius: 10, backgroundColor: canAffordRetry ? '#0070cc' : '#3a3a48', color: '#fff',
                      fontSize: 15, fontWeight: 700, border: '2px solid transparent',
                      cursor: canAffordRetry ? 'pointer' : 'not-allowed',
                      opacity: canAffordRetry ? 1 : 0.55,
                    }}
                  >
                    Roll again — $5M
                  </button>
                  {!canAffordRetry && (
                    <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: '#f87171' }}>
                      Need $5M for another roll. Accept failure or cancel.
                    </p>
                  )}
                </div>
              ) : showGenericRollAgain ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => { reset(); setTimeout(() => void roll(), 300) }}
                    style={{
                      flex: 1, height: 42, borderRadius: 10, backgroundColor: 'transparent', color: '#f0f0f5',
                      fontSize: 14, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
                    }}
                  >
                    Roll Again
                  </button>
                  <button
                    onClick={() => diceValue !== null && onComplete(diceValue)}
                    className="btn-ps"
                    style={{
                      flex: 1, height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                      fontSize: 14, fontWeight: 600, border: '2px solid transparent', cursor: 'pointer',
                    }}
                  >
                    Continue
                  </button>
                </div>
              ) : null}

              {!councilFreezeFailAuto && !takeoverFlow && !scandalFlow && !rezoningFlow && !policeRaidFlow && !removeInvestorsFlow && (
                <button
                  onClick={onCancel}
                  style={{ height: 28, background: 'none', color: '#666680', fontSize: 12, border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              )}
            </div>
            </>
            )}
        </>
      </DialogContent>
    </Dialog>
  )
}

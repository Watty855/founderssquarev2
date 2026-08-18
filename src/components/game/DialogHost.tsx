'use client'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DiscardDialog } from '@/components/dialogs/DiscardDialog'
import { IncomeDialog } from '@/components/dialogs/IncomeDialog'
import { InvestmentOrphanDialog } from '@/components/dialogs/InvestmentOrphanDialog'
import { RollDieDialog } from '@/components/dialogs/RollDieDialog'
import { UndoLastActionDialog } from '@/components/dialogs/UndoLastActionDialog'
import { actionCards, propertyCards } from '@/lib/cardData'
import { CALAMITY_ACCEPT_LABEL, calamityPostRollBannerDetail } from '@/lib/calamity'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { useGameTableStore } from '@/lib/gameTableStore'
import { rollSeatIsAi } from '@/lib/buildRequiredAction'
import {
  createClosedActionCriteriaDialog,
  setActionCriteriaDialog,
  setDiscardPropertyConfirmOpen,
  setDoubleIncomeOrphanDialog,
  setTaxBuildPrompt,
  taxPromptResumeRef,
  usePlayUiStore,
} from '@/lib/playUiStore'
import { MAX_TURN_ACTIONS } from '@/lib/turnActions'

function isAiSeat(p: { isAi?: boolean; aiDifficulty?: unknown } | null | undefined): boolean {
  return p?.isAi === true || p?.aiDifficulty != null
}

const DOUBLE_INCOME_BANK_VALUE = actionCards.find((c) => c.id === 'double-income')?.bankValue ?? 5

export function CalamityAcceptLayer() {
  const pending = usePlayUiStore((s) => s.calamityAcceptPending)
  if (!pending) return null
  const h = getGameHandlers()
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-3 sm:p-6"
      aria-live="assertive"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fs-calamity-accept-title"
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
          id="fs-calamity-accept-title"
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
          Calamity
        </p>
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
          {calamityPostRollBannerDetail({
            face: pending.face,
            playerName: pending.playerName,
            percent: pending.percent,
            lossMillion: pending.lossMillion,
            variant: {
              key: pending.variantKey,
              title: pending.variantTitle,
              flavor: pending.variantFlavor,
            },
          })}
        </p>
        <button
          type="button"
          onClick={() => h.handleAcceptCalamity()}
          className="fs-required-banner-cta"
          style={{
            marginTop: 18,
            height: 44,
            padding: '0 22px',
            borderRadius: 999,
            backgroundColor: '#7f1d1d',
            color: '#fff',
            border: '1px solid #fecaca',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {CALAMITY_ACCEPT_LABEL}
        </button>
      </div>
    </div>
  )
}

export function DialogHost() {
  const gs = useGameTableStore((s) => s)
  const ui = usePlayUiStore((s) => s)
  const h = getGameHandlers()
  const currentPlayer = gs.players[gs.currentPlayerIndex]
  const rd = ui.rollDieDialogState
  const income = ui.incomeDialogState
  const rollDieAiAutoplay = rollSeatIsAi(gs, rd, currentPlayer)

  const hostileTakeoverExchange =
    rd.open && rd.mode === 'hostile-takeover-attacker' && rd.takeoverContext
      ? (() => {
          const ctx = rd.takeoverContext
          const plot = gs.plots.find((p) => p.row === ctx.row && p.col === ctx.col)
          const card = plot?.builtProperty ? propertyCards.find((c) => c.id === plot.builtProperty) : undefined
          return {
            attackerName: currentPlayer?.name ?? 'Founder',
            ownerName: gs.players.find((p) => p.id === ctx.ownerPlayerId)?.name ?? 'Owner',
            plotLabel: `${ctx.col}${ctx.row}`,
            buildingName: card?.name ?? 'Property',
          }
        })()
      : undefined

  const rezoningSummary =
    rd.open && rd.mode === 'rezoning' && rd.rezoningContext
      ? (() => {
          const rz = rd.rezoningContext
          return {
            propertyName: propertyCards.find((c) => c.id === rz.propertyCardId)?.name ?? 'Property',
            plotLabel: `${rz.col}${rz.row}`,
            buildCostMillion: rz.buildCost,
          }
        })()
      : undefined

  const scandalSummary =
    rd.open && rd.mode === 'scandal-attacker' && rd.scandalContext
      ? (() => {
          const sc = rd.scandalContext
          return {
            anchorName: propertyCards.find((c) => c.id === sc.anchorCardId)?.name ?? 'Anchor',
            plotLabel: `${sc.col}${sc.row}`,
            ownerName: gs.players.find((p) => p.id === sc.anchorOwnerPlayerId)?.name ?? 'Owner',
          }
        })()
      : undefined

  const dismissTaxPromptToNormal = () => {
    const pending = taxPromptResumeRef.current
    taxPromptResumeRef.current = null
    setTaxBuildPrompt({
      open: false,
      propertyInstanceId: null,
      actionInstanceId: null,
      housingHighDensity: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    if (pending?.propertyInstanceId) {
      h.handlePlayCards(pending.propertyInstanceId, [], [], {
        ...(pending.housingHighDensity === true ? { housingHighDensity: true } : {}),
        useTaxBuild: false,
        skipTaxBuildPrompt: true,
        ...(pending.wildCardEmulatePropertyId
          ? { wildCardEmulatePropertyId: pending.wildCardEmulatePropertyId }
          : {}),
      })
    }
  }

  return (
    <>
      <InvestmentOrphanDialog
        open={ui.actionCriteriaDialog.open}
        cardName={ui.actionCriteriaDialog.cardName}
        bankValue={ui.actionCriteriaDialog.bankValue}
        reasonDescription={ui.actionCriteriaDialog.reasonDescription}
        onBank={h.handleActionCriteriaBank}
        onCancel={() => setActionCriteriaDialog(createClosedActionCriteriaDialog())}
      />
      <AlertDialog
        open={ui.doubleIncomeOrphanDialog.open}
        onOpenChange={(open) => {
          if (!open) setDoubleIncomeOrphanDialog({ open: false, instanceId: null })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Playing Double Income without Income</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-muted-foreground">
                <p>
                  <strong>Double Income</strong> does not collect or roll for income on its own. It only{' '}
                  <strong>doubles the payout</strong> when you play it <strong>together with an Income card</strong>{' '}
                  in the same play, before you roll for that Income.
                </p>
                <p>
                  Without an Income card in that play, Double Income can only be <strong>banked</strong> for its
                  printed cash value (${DOUBLE_INCOME_BANK_VALUE}M). It will not double anything.
                </p>
                <p className="font-medium text-foreground">Bank this Double Income card now?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => h.handleDoubleIncomeOrphanConfirmBank()}>
              Bank for ${DOUBLE_INCOME_BANK_VALUE}M
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {income.open && income.player && !isAiSeat(income.player) ? (
        <IncomeDialog
          open={income.open}
          player={income.player}
          totalIncome={income.totalIncome}
          churchIncomeBonus={income.churchIncomeBonus}
          churchBonusSourceLabels={income.churchBonusSourceLabels}
          farmCoopIncomeBonus={income.farmCoopIncomeBonus}
          farmCoopBonusSourceLabels={income.farmCoopBonusSourceLabels}
          portAuthorityIncomeBonus={income.portAuthorityIncomeBonus}
          portAuthorityBonusSourceLabels={income.portAuthorityBonusSourceLabels}
          artsCouncilIncomeBonus={income.artsCouncilIncomeBonus}
          artsCouncilBonusSourceLabels={income.artsCouncilBonusSourceLabels}
          tourismOfficeIncomeBonus={income.tourismOfficeIncomeBonus}
          tourismOfficeBonusSourceLabels={income.tourismOfficeBonusSourceLabels}
          influencersIncomeBonus={income.influencersIncomeBonus}
          influencersBonusSourceLabels={income.influencersBonusSourceLabels}
          newsOutletIncomeBonus={income.newsOutletIncomeBonus}
          newsOutletBonusSourceLabels={income.newsOutletBonusSourceLabels}
          mafiaIncomeBonus={income.mafiaIncomeBonus}
          mafiaBonusSourceLabels={income.mafiaBonusSourceLabels}
          mafiaLevyTotal={income.mafiaLevyTotal}
          regulationBureauIncomeBonus={income.regulationBureauIncomeBonus}
          regulationBureauBonusSourceLabels={income.regulationBureauBonusSourceLabels}
          regulationBureauIncomePenalty={income.regulationBureauIncomePenalty}
          rivalRegulationBureauPlotLabels={income.rivalRegulationBureauPlotLabels}
          unionIncomeBonus={income.unionIncomeBonus}
          unionBonusSourceLabels={income.unionBonusSourceLabels}
          unionIncomePenalty={income.unionIncomePenalty}
          rivalUnionPlotLabels={income.rivalUnionPlotLabels}
          hasBuiltPropertiesForIncomeRoll={income.hasBuiltPropertiesForIncomeRoll}
          doubleIncomeAllowed={(gs.turnActionsConsumed ?? 0) + 2 <= MAX_TURN_ACTIONS}
          onComplete={h.handleIncomeComplete}
          onCancel={h.handleIncomeCancel}
          aiAutoplay={income.player?.isAi === true || income.player?.aiDifficulty != null}
        />
      ) : null}
      {ui.discardDialogState.open ? (
        <DiscardDialog
          open={ui.discardDialogState.open}
          player={gs.players[gs.currentPlayerIndex]}
          numToDiscard={ui.discardDialogState.numToDiscard}
          onComplete={h.handleDiscardComplete}
          aiConfirmSelection={currentPlayer?.isAi === true}
        />
      ) : null}
      {ui.undoActionDialogOpen && gs.undoLastAction ? (
        <UndoLastActionDialog
          open={ui.undoActionDialogOpen}
          actionLabel={gs.undoLastAction.label}
          onConfirm={h.handleUndoLastAction}
          onCancel={h.handleUndoLastActionCancel}
        />
      ) : null}
      {rd.open ? (
        <RollDieDialog
          key={`${rd.mode}-${rd.actionInstanceId ?? ''}`}
          open={rd.open}
          mode={rd.mode}
          influenceBonus={rd.influenceBonus ?? 0}
          influenceLabels={rd.influenceLabels ?? []}
          defenderName={
            rd.mode === 'council-freeze-attacker' ||
            rd.mode === 'council-freeze-defender' ||
            rd.mode === 'police-raid-defender'
              ? rd.targetPlayerId != null
                ? gs.players.find((p) => p.id === rd.targetPlayerId)?.name
                : undefined
              : rd.mode === 'hostile-takeover-defender'
                ? gs.players.find((p) => p.id === rd.takeoverContext?.ownerPlayerId)?.name
                : rd.mode === 'scandal-defender' && rd.scandalContext != null
                  ? gs.players.find((p) => p.id === rd.scandalContext!.anchorOwnerPlayerId)?.name
                  : rd.mode === 'hostile-takeover-attacker'
                    ? gs.players.find((p) => p.id === rd.takeoverContext?.ownerPlayerId)?.name
                    : undefined
          }
          actingPlayerName={
            rd.mode === 'calamity' && rd.targetPlayerId != null
              ? gs.players.find((p) => p.id === rd.targetPlayerId)?.name ?? currentPlayer?.name
              : currentPlayer?.name
          }
          councilFreezeAttackerRollsCompleted={rd.councilFreezeAttackerRollsCompleted}
          attackerMoney={currentPlayer?.money}
          councilFreezeFailAuto={rd.councilFreezeFailAuto === true}
          diceRetryNonce={rd.diceRetryNonce}
          onAttackerDieSettled={h.handleAttackerDieSettled}
          onCouncilFreezeAttackerRollAgain={h.handleCouncilFreezeAttackerRollAgain}
          onCouncilFreezeFailDismiss={h.handleCouncilFreezeFailDismiss}
          onComplete={h.handleRollDieComplete}
          onCancel={h.handleRollDieCancel}
          hostileTakeoverExchange={hostileTakeoverExchange}
          rezoningSummary={rezoningSummary}
          scandalSummary={scandalSummary}
          calamitySummary={
            rd.mode === 'calamity' && gs.pendingCalamity
              ? {
                  rollerName:
                    gs.players.find((p) => p.id === rd.targetPlayerId)?.name ?? currentPlayer?.name ?? 'Founder',
                  drawerName: gs.pendingCalamity.drawnByName,
                  rollIndex: gs.pendingCalamity.currentRollIndex,
                  totalPlayers: gs.pendingCalamity.rollOrderPlayerIds.length,
                  usedVariantKeys: gs.calamityUsedVariantKeys,
                  rollerMoney:
                    gs.players.find((p) => p.id === rd.targetPlayerId)?.money ?? currentPlayer?.money ?? 0,
                }
              : undefined
          }
          aiAutoplay={rollDieAiAutoplay}
          onCalamitySettled={h.handleCalamitySettled}
        />
      ) : null}
      <AlertDialog
        open={ui.taxBuildPrompt.open}
        onOpenChange={(open) => {
          if (!open) {
            taxPromptResumeRef.current = null
            setTaxBuildPrompt({
              open: false,
              propertyInstanceId: null,
              actionInstanceId: null,
              housingHighDensity: undefined,
              wildCardEmulatePropertyId: undefined,
            })
          }
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (!ui.taxBuildPrompt.open) return
            event.preventDefault()
            dismissTaxPromptToNormal()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Use Build with Tax Dollars?</AlertDialogTitle>
            <AlertDialogDescription>
              You have Build with Tax Dollars in hand. Build this property at 50% cost and discard that action card?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="order-first w-full text-sm text-muted-foreground underline-offset-4 hover:underline sm:order-none sm:mr-auto sm:w-auto"
              onClick={() => h.abortTaxBuildPrompt()}
            >
              Cancel — don&apos;t build
            </button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <AlertDialogCancel
                onClick={(e) => {
                  e.preventDefault()
                  dismissTaxPromptToNormal()
                }}
              >
                No, normal cost
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const pending = taxPromptResumeRef.current
                  if (!pending?.propertyInstanceId || !pending.taxActionInstanceId) return
                  taxPromptResumeRef.current = null
                  h.handlePlayCards(pending.propertyInstanceId, [], [], {
                    housingHighDensity: pending.housingHighDensity,
                    useTaxBuild: true,
                    taxBuildActionInstanceId: pending.taxActionInstanceId,
                    skipTaxBuildPrompt: true,
                    wildCardEmulatePropertyId: pending.wildCardEmulatePropertyId,
                  })
                }}
              >
                Yes, build at half cost
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={ui.discardPropertyConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setDiscardPropertyConfirmOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard property cards?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {ui.discardPropertySelectMode.selectedPropertyInstanceIds.length === 0 ? (
                  <p style={{ color: 'rgba(148,163,184,0.95)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                    You selected no property cards. The action will still be discarded and you will not draw replacements.
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'rgba(148,163,184,0.95)', fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>
                      These cards go to the property discard pile; you draw the same number from the property deck
                      only (the property discard pile is not reshuffled into the deck).
                    </p>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 20,
                        color: 'rgba(226,232,240,0.92)',
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      {ui.discardPropertySelectMode.selectedPropertyInstanceIds.map((id) => {
                        const inst = currentPlayer?.propertyCards.find((c) => c.instanceId === id)
                        const nm = inst ? propertyCards.find((c) => c.id === inst.cardId)?.name : undefined
                        return <li key={id}>{nm ?? 'Unknown card'}</li>
                      })}
                    </ul>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardPropertyConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <Button type="button" onClick={() => h.handleConfirmDiscardProperty()}>
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

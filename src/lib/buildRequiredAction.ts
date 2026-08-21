'use client'

import type { GameState, Player } from '@/lib/types'
import type { PropertyCard } from '@/lib/cardTypes'
import { propertyCards } from '@/lib/cardData'
import { getValidPlotsForProperty } from '@/lib/placementRules'
import { needsEmulateChoiceBeforePlacement, resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import {
  attackRollRequiredTitle,
  defenseRollRequiredTitle,
} from '@/lib/confrontationNotice'
import { CALAMITY_ACCEPT_LABEL, CALAMITY_PRE_ROLL_INSTRUCTION } from '@/lib/calamity'
import { HIGH_DENSITY_HOUSING_STATS } from '@/lib/housingEconomics'
import { MAX_ACTION_HAND_SIZE } from '@/lib/turnActions'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import type { PlayUiState, RollDieDialogState } from '@/lib/playUiStore'
import type { RequiredAction } from '@/components/game/RequiredActionBanner'
import { setDiscardPropertyConfirmOpen, setTaxBuildMode } from '@/lib/playUiStore'
import { gameDockToast as toast } from '@/lib/fsGameToast'

export function rollSeatIsAi(
  gs: GameState,
  rd: Pick<RollDieDialogState, 'open' | 'mode' | 'targetPlayerId' | 'takeoverContext' | 'scandalContext'>,
  currentSeat: Player | undefined
): boolean {
  if (!rd.open) return false
  const playerIsAi = (id: number | undefined | null): boolean =>
    id != null && gs.players.some((p) => p.id === id && (p.isAi === true || p.aiDifficulty != null))
  switch (rd.mode) {
    case 'council-freeze-defender':
      return playerIsAi(rd.targetPlayerId)
    case 'hostile-takeover-defender':
      return playerIsAi(rd.takeoverContext?.ownerPlayerId ?? rd.targetPlayerId)
    case 'scandal-defender':
      return playerIsAi(rd.scandalContext?.anchorOwnerPlayerId)
    case 'police-raid-defender':
      return playerIsAi(rd.targetPlayerId)
    case 'calamity':
      return playerIsAi(rd.targetPlayerId)
    default:
      return currentSeat?.isAi === true
  }
}

export function buildRequiredAction(gs: GameState, ui: PlayUiState): RequiredAction | null {
  const h = getGameHandlers()
  const currentPlayer = gs.players[gs.currentPlayerIndex]
  const rollDieAiAutoplay = rollSeatIsAi(gs, ui.rollDieDialogState, currentPlayer)

  if (gs.pendingEndGameDeclaration) {
    const pending = gs.pendingEndGameDeclaration
    const name = gs.players.find((p) => p.id === pending.playerId)?.name ?? 'Founder'
    return {
      id: `endgame-declare-${pending.playerId}-${pending.phase}-${pending.lastChance ? 'last' : pending.deferTurnsRemaining}`,
      title: pending.lastChance ? 'Last chance to declare the endgame' : 'Declare the endgame?',
      detail: pending.lastChance
        ? `${name} has ${pending.clusterSize} adjacent properties. Declare for one more round each, or the game ends now.`
        : `${name} has ${pending.clusterSize} adjacent properties. Declare for one more round each, or continue playing.`,
      tone: pending.lastChance ? 'danger' : 'warning',
      ctaLabel: currentPlayer?.isAi ? 'Unstick' : 'Choose in dialog',
      onCta: currentPlayer?.isAi ? h.handleUnstickPlay : undefined,
    }
  }

  if (ui.calamityAcceptPending) {
    const pending = ui.calamityAcceptPending
    return {
      id: `calamity-accept-${pending.face}-${pending.variantKey}`,
      title: 'Calamity',
      detail: `Rolled ${pending.face}. ${pending.percent}% of cash reserve lost. ${pending.variantTitle}: ${pending.variantFlavor}`,
      tone: 'calamity',
      ctaLabel: pending.autoAccept ? 'Resolving…' : CALAMITY_ACCEPT_LABEL,
      onCta: pending.autoAccept ? undefined : h.handleAcceptCalamity,
    }
  }

  const rd = ui.rollDieDialogState
  if (rd.open) {
    const defenderName =
      rd.mode === 'hostile-takeover-defender'
        ? gs.players.find((p) => p.id === rd.takeoverContext?.ownerPlayerId)?.name
        : rd.mode === 'scandal-defender'
          ? gs.players.find((p) => p.id === rd.scandalContext?.anchorOwnerPlayerId)?.name
          : rd.targetPlayerId != null
            ? gs.players.find((p) => p.id === rd.targetPlayerId)?.name
            : undefined
    const aiDiceCta = rollDieAiAutoplay
      ? {
          ctaLabel: 'Unstick',
          onCta: h.handleUnstickPlay,
          detailSuffix: ' Computer is resolving — tap Unstick if this hangs.',
        }
      : { ctaLabel: 'Roll in dialog', onCta: undefined as (() => void) | undefined, detailSuffix: '' }
    switch (rd.mode) {
      case 'council-freeze-attacker':
        return {
          id: 'cf-att',
          title: attackRollRequiredTitle('City Council Freeze', currentPlayer?.name ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${currentPlayer?.name ?? 'Founderbot'} is rolling City Council Freeze.`
              : 'Roll the die in the dialog. First roll free; each retry costs $5M. After 3 misses the freeze fails.') +
            aiDiceCta.detailSuffix,
          tone: 'danger',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'council-freeze-defender':
        return {
          id: 'cf-def',
          title: defenseRollRequiredTitle('City Council Freeze', defenderName ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${defenderName ?? 'Computer'} is rolling to negate the freeze.`
              : `${defenderName ?? 'Defender'} rolls once in the dialog. Only a 6 negates the freeze.`) +
            aiDiceCta.detailSuffix,
          tone: 'danger',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'hostile-takeover-attacker':
        return {
          id: 'ht-att',
          title: attackRollRequiredTitle('Hostile Takeover', currentPlayer?.name ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${currentPlayer?.name ?? 'Founderbot'} is resolving Hostile Takeover.`
              : '$1M attempt fee paid. Roll in the dialog — 5–6 succeeds; +1 influence makes 4–6 succeed; +2 makes 3–6 succeed.') +
            aiDiceCta.detailSuffix,
          tone: 'danger',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'hostile-takeover-defender':
        return {
          id: 'ht-def',
          title: defenseRollRequiredTitle('Hostile Takeover', defenderName ?? 'Owner'),
          detail:
            (rollDieAiAutoplay
              ? `${defenderName ?? 'Computer'} is rolling the defense.`
              : `${defenderName ?? 'Owner'} rolls once. Only a 6 blocks the takeover.`) +
            aiDiceCta.detailSuffix,
          tone: 'danger',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'scandal-attacker':
        return {
          id: 'sc-att',
          title: attackRollRequiredTitle('Scandal', currentPlayer?.name ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${currentPlayer?.name ?? 'Founderbot'} is resolving Scandal.`
              : 'Roll in the dialog. Total 6+ after Influencer / News Outlet bonuses succeeds.') +
            aiDiceCta.detailSuffix,
          tone: 'warning',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'scandal-defender':
        return {
          id: 'sc-def',
          title: defenseRollRequiredTitle('Scandal', defenderName ?? 'Anchor owner'),
          detail:
            (rollDieAiAutoplay
              ? `${defenderName ?? 'Computer'} is rolling the defense.`
              : `${defenderName ?? 'Anchor owner'} rolls once. Only a 6 negates the scandal.`) +
            aiDiceCta.detailSuffix,
          tone: 'warning',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'rezoning':
        return {
          id: 'rz-roll',
          title: attackRollRequiredTitle('Rezoning', currentPlayer?.name ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${currentPlayer?.name ?? 'Founderbot'} is rolling for Rezoning approval.`
              : 'Roll in the dialog — 5–6 approves; +1 influence makes 4–6 approve; +2 makes 3–6 approve.') +
            aiDiceCta.detailSuffix,
          tone: 'warning',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'police-raid-attacker':
        return {
          id: 'pr-att',
          title: attackRollRequiredTitle('Police Raid on Mafia', currentPlayer?.name ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${currentPlayer?.name ?? 'Founderbot'} is resolving Police Raid on Mafia.`
              : 'Roll in the dialog. Total 5+ after eligible raid influence succeeds.') +
            aiDiceCta.detailSuffix,
          tone: 'danger',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'police-raid-defender':
        return {
          id: 'pr-def',
          title: defenseRollRequiredTitle('Police Raid on Mafia', defenderName ?? 'Mafia owner'),
          detail:
            (rollDieAiAutoplay
              ? `${defenderName ?? 'Computer'} is rolling the Mafia counter.`
              : `${defenderName ?? 'Mafia owner'} rolls once. A 6 counters (5–6 if raid had influence).`) +
            aiDiceCta.detailSuffix,
          tone: 'danger',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'remove-investors':
        return {
          id: 'ri',
          title: attackRollRequiredTitle('Remove Investors', currentPlayer?.name ?? 'Founder'),
          detail:
            (rollDieAiAutoplay
              ? `${currentPlayer?.name ?? 'Founderbot'} is rolling to clear investors.`
              : 'Roll in the dialog. Total 5+ includes block anchor and civic influence. No investor counter-roll. On success pay each investor 50% of their stake; all stripes on that lot clear.') +
            aiDiceCta.detailSuffix,
          tone: 'warning',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'roll-die':
        return {
          id: 'roll-die',
          title: attackRollRequiredTitle('Roll', currentPlayer?.name ?? 'Founder'),
          detail: 'Roll the die in the dialog to continue.' + aiDiceCta.detailSuffix,
          tone: 'info',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      case 'calamity': {
        const calamityRoller =
          rd.targetPlayerId != null ? gs.players.find((p) => p.id === rd.targetPlayerId) : currentPlayer
        return {
          id: `calamity-${rd.targetPlayerId ?? 'x'}`,
          title: 'Calamity',
          detail:
            (rollDieAiAutoplay
              ? `${calamityRoller?.name ?? 'Founderbot'} is rolling. ${CALAMITY_PRE_ROLL_INSTRUCTION}`
              : `${calamityRoller?.name ?? 'You'} must roll. ${CALAMITY_PRE_ROLL_INSTRUCTION}`) +
            aiDiceCta.detailSuffix,
          tone: 'calamity',
          ctaLabel: aiDiceCta.ctaLabel,
          onCta: aiDiceCta.onCta,
        }
      }
    }
  }

  if (gs.pendingCalamity) {
    const pending = gs.pendingCalamity
    const rollerId = pending.rollOrderPlayerIds[pending.currentRollIndex]
    const roller = gs.players.find((p) => p.id === rollerId)
    const pendingRollerAi = roller?.isAi === true
    return {
      id: `calamity-wait-${pending.currentRollIndex}`,
      title: 'Calamity',
      detail: pendingRollerAi
        ? `${roller?.name ?? 'A Founderbot'} should auto-roll — tap Unstick if this hangs.`
        : `${roller?.name ?? 'The next founder'} rolls on their own screen. ${CALAMITY_PRE_ROLL_INSTRUCTION}`,
      tone: 'calamity',
      ctaLabel: pendingRollerAi ? 'Unstick' : 'Waiting for their roll',
      onCta: pendingRollerAi ? h.handleUnstickPlay : undefined,
    }
  }
  if (gs.pendingCouncilFreezeDefense) {
    const pending = gs.pendingCouncilFreezeDefense
    const pendingDefAi = gs.players.find((p) => p.id === pending.targetPlayerId)?.isAi === true
    return {
      id: 'cf-def-wait',
      title: defenseRollRequiredTitle('City Council Freeze', pending.targetName),
      detail: pendingDefAi
        ? `${pending.attackerName}'s freeze succeeded. ${pending.targetName} (computer) should auto-roll — tap Unstick if this hangs.`
        : `${pending.attackerName}'s freeze succeeded. ${pending.targetName} rolls on their own screen — only a 6 negates it.`,
      tone: 'danger',
      ctaLabel: pendingDefAi ? 'Unstick' : 'Waiting for their roll',
      onCta: pendingDefAi ? h.handleUnstickPlay : undefined,
    }
  }
  if (gs.pendingRebuttalRoll) {
    const pending = gs.pendingRebuttalRoll
    const kindTitle =
      pending.kind === 'scandal'
        ? 'Scandal'
        : pending.kind === 'hostile-takeover'
          ? 'Hostile Takeover'
          : 'Police Raid on Mafia'
    const pendingDefAi = gs.players.find((p) => p.id === pending.targetPlayerId)?.isAi === true
    return {
      id: 'rebuttal-wait',
      title: defenseRollRequiredTitle(kindTitle, pending.targetName),
      detail: pendingDefAi
        ? `${pending.attackerName}'s play succeeded. ${pending.targetName} (computer) should auto-roll — tap Unstick if this hangs.`
        : `${pending.attackerName}'s play succeeded. ${pending.targetName} rolls on their own screen.`,
      tone: 'danger',
      ctaLabel: pendingDefAi ? 'Unstick' : 'Waiting for their roll',
      onCta: pendingDefAi ? h.handleUnstickPlay : undefined,
    }
  }
  if (ui.discardDialogState.open || gs.awaitingEndTurnActionDiscard) {
    return {
      id: 'action-hand-discard',
      title: `End of turn — discard to ${MAX_ACTION_HAND_SIZE}`,
      detail: `You may hold more than ${MAX_ACTION_HAND_SIZE} action cards during your turn. Discard down to ${MAX_ACTION_HAND_SIZE} now to finish ending this turn.`,
      tone: 'warning',
      ctaLabel: 'Choose cards in dialog',
    }
  }
  if (ui.incomeDialogState.open) {
    return {
      id: 'income',
      title: 'Income — review and confirm',
      detail:
        'Review your income breakdown in the dialog and click Collect to take your earnings before continuing your turn.',
      tone: 'info',
      ctaLabel: 'Collect in dialog',
    }
  }
  if (ui.rezoningMode.phase === 'pick-property') {
    return {
      id: 'rz-pick-property',
      title: 'Rezoning — pick a property card',
      detail: 'Click a highlighted non-anchor property card in your hand to use for Rezoning.',
      tone: 'warning',
      cancelLabel: 'Cancel Rezoning',
      onCancel: h.handleCancelRezoning,
    }
  }
  if (ui.rezoningMode.phase === 'pick-housing-density') {
    return {
      id: 'rz-density',
      title: 'Rezoning — choose Housing density',
      detail: `Pick standard ($8M) or high-density ($${HIGH_DENSITY_HOUSING_STATS.buildCost}M) housing in your hand panel.`,
      tone: 'warning',
      cancelLabel: 'Cancel Rezoning',
      onCancel: h.handleCancelRezoning,
    }
  }
  if (ui.rezoningMode.phase === 'pick-plot') {
    return {
      id: 'rz-pick-plot',
      title: 'Rezoning — pick a vacant city lot',
      detail: 'Click a highlighted vacant city lot on the board.',
      tone: 'warning',
      cancelLabel: 'Cancel Rezoning',
      onCancel: h.handleCancelRezoning,
    }
  }
  if (ui.takeoverSelectMode.active) {
    return {
      id: 'ht-pick',
      title: currentPlayer?.isAi ? 'Hostile Takeover — computer choosing target' : 'Hostile Takeover — pick a target',
      detail: currentPlayer?.isAi
        ? 'Founderbot should select a highlighted lot — tap Unstick if this hangs.'
        : 'Click a highlighted opponent property on the board (same city block or orthogonal to your built lots, including across a street).',
      tone: 'danger',
      ctaLabel: currentPlayer?.isAi ? 'Unstick' : undefined,
      onCta: currentPlayer?.isAi ? h.handleUnstickPlay : undefined,
      cancelLabel: currentPlayer?.isAi ? undefined : 'Cancel Takeover',
      onCancel: currentPlayer?.isAi ? undefined : h.handleCancelTakeoverSelect,
    }
  }
  if (ui.scandalSelectMode.active) {
    return {
      id: 'sc-pick',
      title: currentPlayer?.isAi ? 'Scandal — computer choosing target' : 'Scandal — pick an anchor target',
      detail: currentPlayer?.isAi
        ? 'Founderbot should select a highlighted anchor — tap Unstick if this hangs.'
        : 'Click a highlighted built anchor tenant on the board to scandalize.',
      tone: 'warning',
      ctaLabel: currentPlayer?.isAi ? 'Unstick' : undefined,
      onCta: currentPlayer?.isAi ? h.handleUnstickPlay : undefined,
      cancelLabel: currentPlayer?.isAi ? undefined : 'Cancel Scandal',
      onCancel: currentPlayer?.isAi ? undefined : h.handleCancelScandalSelect,
    }
  }
  if (ui.removeInvestorsSelectMode.active) {
    return {
      id: 'ri-pick',
      title: currentPlayer?.isAi ? 'Remove Investors — computer choosing lot' : 'Remove Investors — pick your property',
      detail: currentPlayer?.isAi
        ? 'Founderbot should pick an invested lot — tap Unstick if this hangs.'
        : 'Click a highlighted lot you own that still has investor stripes. Multiple investors on one lot are cleared together if you succeed. You must be able to afford the combined 50% buyouts before the roll.',
      tone: 'warning',
      ctaLabel: currentPlayer?.isAi ? 'Unstick' : undefined,
      onCta: currentPlayer?.isAi ? h.handleUnstickPlay : undefined,
      cancelLabel: currentPlayer?.isAi ? undefined : 'Cancel',
      onCancel: currentPlayer?.isAi ? undefined : h.handleCancelRemoveInvestorsSelect,
    }
  }
  if (ui.investmentSelectMode.active) {
    return {
      id: 'inv-pick',
      title: currentPlayer?.isAi ? 'Investment — computer choosing target' : 'Investment — pick a target',
      detail: currentPlayer?.isAi
        ? 'Founderbot should select a highlighted lot — tap Unstick if this hangs.'
        : 'Click a highlighted opponent property on the board to invest in it.',
      tone: 'info',
      ctaLabel: currentPlayer?.isAi ? 'Unstick' : undefined,
      onCta: currentPlayer?.isAi ? h.handleUnstickPlay : undefined,
      cancelLabel: currentPlayer?.isAi ? undefined : 'Cancel Investment',
      onCancel: currentPlayer?.isAi ? undefined : h.handleCancelInvestmentSelect,
    }
  }
  if (ui.discardPropertySelectMode.active) {
    return {
      id: 'dpc-pick',
      title: currentPlayer?.isAi
        ? 'Discard Property Cards — computer resolving'
        : 'Discard Property Cards — choose from hand',
      detail: currentPlayer?.isAi
        ? 'Founderbot is discarding from its own hand (not the host rail) — tap Unstick if this hangs.'
        : 'All property cards are highlighted. Tap to select (orange) or deselect. Confirm in the dialog to discard and draw replacements — or discard none and spend only the action.',
      tone: 'info',
      ctaLabel: currentPlayer?.isAi ? 'Unstick' : 'Review / discard…',
      onCta: currentPlayer?.isAi ? h.handleUnstickPlay : () => setDiscardPropertyConfirmOpen(true),
      cancelLabel: currentPlayer?.isAi ? undefined : 'Cancel',
      onCancel: currentPlayer?.isAi ? undefined : h.handleCancelDiscardPropertySelect,
    }
  }
  if (ui.taxBuildMode.phase === 'pick-property') {
    return {
      id: 'tax-pick',
      title: 'Build with Tax Dollars — pick a property card',
      detail: 'Click a highlighted property card in your hand to build at 50% cost.',
      tone: 'info',
      cancelLabel: 'Cancel',
      onCancel: () => {
        setTaxBuildMode({ phase: 'inactive' })
        toast.info('Build with Tax Dollars cancelled.')
      },
    }
  }
  if (ui.placementMode.active && ui.placementMode.propertyCardId && currentPlayer) {
    const instance = currentPlayer.propertyCards.find((c) => c.instanceId === ui.placementMode.propertyCardId)
    const card = instance ? propertyCards.find((c) => c.id === instance.cardId) : undefined
    const emulateId = ui.placementMode.wildCardEmulatePropertyId
    const template =
      card && needsEmulateChoiceBeforePlacement(card as PropertyCard)
        ? resolvePropertyPlacementTemplate(card as PropertyCard, emulateId)
        : card
    const placeName = template?.name ?? 'property'
    const placementPlotCount =
      template && instance
        ? getValidPlotsForProperty(template as PropertyCard, gs.plots, gs.crossingTheLineActive).length
        : 0
    const noLots = placementPlotCount === 0
    return {
      id: `place-${ui.placementMode.propertyCardId}`,
      title: noLots ? `Build — no legal lots for ${placeName}` : `Build — pick a lot for ${placeName}`,
      detail: noLots
        ? 'District rules or the board state leave nowhere to build. Click Cancel — nothing is spent; your property card stays in hand.'
        : card && needsEmulateChoiceBeforePlacement(card as PropertyCard)
          ? `Click a highlighted lot on the board to build as ${placeName}, or Cancel to stop without building.`
          : 'Click a highlighted lot on the board to build, or Cancel to stop without building.',
      tone: noLots ? 'warning' : 'info',
      cancelLabel: 'Cancel build',
      onCancel: h.handleCancelPlacement,
    }
  }
  return null
}

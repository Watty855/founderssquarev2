#!/usr/bin/env python3
"""One-shot Phase 3 extractor. Not part of the game runtime."""
from __future__ import annotations

from pathlib import Path

ROOT = Path("/Users/dw/Founders Square/founderssquarev2")
GAME = ROOT / "src/components/game/GameApp.tsx"
OUT = ROOT / "src/components/game/playSession"

DESTRUCTURE = """  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
  } = s
  const gameState = safeGameState
"""

SHARED = ''''use client'

import type { PlayCardsOptions } from '@/components/game/PlayerHand'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { propertyCards, actionCards } from '@/lib/cardData'
import type { PropertyCard, CardInstance } from '@/lib/cardTypes'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyBankActionCards } from '@/lib/gameEngine/applyBankAction'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import { vacateOverthrownAnchorPlot } from '@/lib/gameEngine/applyRebuttalResolution'
import { attachUndoSnapshotIfTurnAction, restoreUndoSnapshot } from '@/lib/undoLastAction'
import {
  beginCalamity,
  calamityAllowedThisRound,
  calamityLossMillion,
  calamityPercentForFace,
  applyCalamityRoll,
  findCalamityVariant,
  pickCalamityVariant,
  resolveCalamityDraw,
  dealActionHandSkippingCalamity,
} from '@/lib/calamity'
import { createActionDeck, createPropertyDeck, drawCards, drawFromDeckWithDiscardReshuffle, shuffleDeck } from '@/lib/deckUtils'
import { createInitialBoard } from '@/lib/boardData'
import { playerHasBuiltIncomeProperty, pickAiDiscardPropertyIds, pickAiActionCardDiscardIds } from '@/lib/bot/simpleAiTurn'
import { incomePercentageForDie } from '@/lib/incomeDice'
import { getInvestablePlots, getTakeoverTargetPlots } from '@/lib/investmentTargets'
import { boardHasBuiltAnchorTenant, boardHasBuiltMafia } from '@/lib/actionPreconditions'
import {
  getHousingBuildCost,
  getPlotPropertyEndValue,
  getPlotPropertyIncome,
  HIGH_DENSITY_HOUSING_STATS,
  isHousingPropertyCard,
} from '@/lib/housingEconomics'
import { getBuildCelebrationNotice, getPlotLotDisplayName } from '@/lib/buildCelebrationMessages'
import {
  getChurchIncomeBonusForPlayer,
  getArtsCouncilIncomeBonusForPlayer,
  getFarmCoopIncomeBonusForPlayer,
  getPortAuthorityIncomeBonusForPlayer,
  getTourismOfficeIncomeBonusForPlayer,
  getInfluencersIncomeBonusForPlayer,
  getNewsOutletIncomeBonusForPlayer,
  getMafiaIncomeBonusForPlayer,
  getMafiaLevyForIncomePlayer,
  getRegulationBureauIncomeBonusForPlayer,
  getRegulationBureauIncomePenaltyForPlayer,
  getUnionIncomeBonusForOwner,
  getUnionIncomePenaltyForPlayer,
  getAnchorInfluenceForAction,
  getScandalAttackerRollBonuses,
  getPlotsEligibleForScandal,
  getCityCouncilFreezeAttackerInfluence,
  getPoliceRaidAttackerInfluence,
  totalRemoveInvestorsBuyoutMillion,
  investorRemovalBuyoutMillion,
  computeInvestorIncomeAwardsForOwner,
  allocateInvestorPayoutsFromOwner,
  allocateMafiaTributeFromOwner,
} from '@/lib/utils'
import {
  MAX_TURN_ACTIONS,
  MAX_ACTION_HAND_SIZE,
  REZONING_SUCCESS_ACTION_COST,
  canAttemptRezoning,
  replenishCurrentPlayerActionHand,
  turnLimitReached,
} from '@/lib/turnActions'
import { nextPlayRoundNumber } from '@/lib/playRound'
import { gameDockToast as toast } from '@/lib/fsGameToast'
import { playCalamitySound } from '@/lib/soundEffects'
import { clearBoardNotice, dismissOpeningProTip, resetOverlayStore } from '@/lib/gameOverlayStore'
import {
  closedIncomeDialog,
  createClosedActionCriteriaDialog,
  getPlayUiSnapshot,
  resetPlayUiStore,
  setActionCriteriaDialog,
  setCalamityAcceptPending,
  setDiscardDialogState,
  setDiscardPropertyConfirmOpen,
  setDiscardPropertySelectMode,
  setDoubleIncomeOrphanDialog,
  setIncomeDialogState,
  setInvestmentSelectMode,
  setPlacementMode,
  setRemoveInvestorsSelectMode,
  setRezoningMode,
  setRollDieDialogState,
  setScandalSelectMode,
  setTakeoverSelectMode,
  setTaxBuildMode,
  setTaxBuildPrompt,
  setUndoActionDialogOpen,
  taxPromptResumeRef,
} from '@/lib/playUiStore'
import { saveLastOnlineSession, clearLastOnlineSession } from '@/lib/onlineSessionMemory'
import { clearAuthoritySnapshot } from '@/lib/onlineAuthorityMemory'
import type { Player, GameState } from '@/lib/types'
import type { PartyBoardSyncConfig, PartyBoardSyncMeta } from '@/lib/partyBoardSync'
import { rollSeatIsAi } from '@/lib/buildRequiredAction'
import { getValidPlotsForProperty, getVacantCityLotsForRezoning } from '@/lib/placementRules'
import { needsEmulateChoiceBeforePlacement, resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import { isCivicFlexHandCard } from '@/lib/civicFlexProperty'
import {
  confrontationAttemptTitle,
  hostileTakeoverAttemptTitle,
  hostileTakeoverAttackerSuccessTitle,
  hostileTakeoverDefenseSuccessTitle,
  investmentNoticeTitle,
} from '@/lib/confrontationNotice'
import { countResolvedActionStepsInBatch, initialGameState, isAiSeat, withReplenishedActionHand } from './helpers'
import type { PlaySession } from './types'
import { commitCalamityRoll } from './calamity'
'''

# (file, export_name, marker unique start)
FUNCS = [
    ("setup.ts", "guestJoined", "  const handleGuestJoined = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => {"),
    ("setup.ts", "resumeHostTable", "  const handleResumeHostTable = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => {"),
    ("calamity.ts", "calamitySettled", "  const handleCalamitySettled = useCallback("),
    ("setup.ts", "setupComplete", "  const handleSetupComplete = (players: Player[], partyBoard?: PartyBoardSyncMeta) => {"),
    ("playCards.ts", "playCards", "  const handlePlayCards = ("),
    ("plots.ts", "plotSelect", "  const handlePlotSelect = (row: number, col: string) => {"),
    ("turn.ts", "endTurn", "  const handleEndTurn = () => {"),
    ("turn.ts", "discardComplete", "  const handleDiscardComplete = (discardedInstanceIds: string[]) => {"),
    ("plots.ts", "cancelInvestmentSelect", "  const handleCancelInvestmentSelect = () => {"),
    ("plots.ts", "cancelDiscardPropertySelect", "  const handleCancelDiscardPropertySelect = () => {"),
    ("plots.ts", "toggleDiscardPropertySelection", "  const handleToggleDiscardPropertySelection = (propertyInstanceId: string) => {"),
    ("plots.ts", "confirmDiscardProperty", "  const handleConfirmDiscardProperty = ("),
    ("plots.ts", "investmentPlotSelect", "  const handleInvestmentPlotSelect = (row: number, col: string) => {"),
    ("plots.ts", "cancelRemoveInvestorsSelect", "  const handleCancelRemoveInvestorsSelect = () => {"),
    ("plots.ts", "removeInvestorsPlotSelect", "  const handleRemoveInvestorsPlotSelect = (row: number, col: string) => {"),
    ("plots.ts", "actionCriteriaBank", "  const handleActionCriteriaBank = () => {"),
    ("plots.ts", "cancelTakeoverSelect", "  const handleCancelTakeoverSelect = () => {"),
    ("plots.ts", "cancelScandalSelect", "  const handleCancelScandalSelect = () => {"),
    ("plots.ts", "cancelRezoning", "  const handleCancelRezoning = () => {"),
    ("plots.ts", "cancelPlacement", "  const handleCancelPlacement = useCallback(() => {"),
    ("plots.ts", "abortTaxBuildPrompt", "  const abortTaxBuildPrompt = useCallback(() => {"),
    ("plots.ts", "rezoningPropertyFromHand", "  const handleRezoningPropertyFromHand = (propertyInstanceId: string) => {"),
    ("plots.ts", "rezoningHousingDensity", "  const handleRezoningHousingDensity = (highDensity: boolean) => {"),
    ("plots.ts", "rezoningPlotSelect", "  const handleRezoningPlotSelect = (row: number, col: string) => {"),
    ("plots.ts", "takeoverPlotSelect", "  const handleTakeoverPlotSelect = (row: number, col: string) => {"),
    ("plots.ts", "scandalPlotSelect", "  const handleScandalPlotSelect = (row: number, col: string) => {"),
    ("plots.ts", "plotClaim", "  const handlePlotClaim = (row: number, col: string) => {"),
    ("setup.ts", "resetLocalUiToTitle", "  const resetLocalUiToTitle = () => {"),
    ("setup.ts", "leaveTable", "  const handleLeaveTable = () => {"),
    ("setup.ts", "endTable", "  const handleEndTable = () => {"),
    ("setup.ts", "newGame", "  const handleNewGame = () => {"),
    ("income.ts", "doubleIncomeOrphanConfirmBank", "  const handleDoubleIncomeOrphanConfirmBank = () => {"),
    ("income.ts", "incomeComplete", "  const handleIncomeComplete = ("),
    ("income.ts", "incomeCancel", "  const handleIncomeCancel = () => {"),
    ("turn.ts", "propertyClick", "  const handlePropertyClick = (row: number, col: string) => {"),
    ("turn.ts", "vacantLotHint", "  const handleVacantLotHint = useCallback(() => {"),
    ("turn.ts", "undoLastAction", "  const handleUndoLastAction = () => {"),
    ("turn.ts", "undoLastActionCancel", "  const handleUndoLastActionCancel = () => {"),
    ("dice.ts", "finalizeCouncilFreezeAttackFailure", "  const finalizeCouncilFreezeAttackFailure = useCallback((instanceId: string, source: 'accept' | 'auto' = 'accept') => {"),
    ("dice.ts", "attackerDieSettled", "  const handleAttackerDieSettled = useCallback((natural: number) => {"),
    ("dice.ts", "councilFreezeAttackerRollAgain", "  const handleCouncilFreezeAttackerRollAgain = useCallback(() => {"),
    ("dice.ts", "councilFreezeFailDismiss", "  const handleCouncilFreezeFailDismiss = useCallback(() => {"),
    ("dice.ts", "finalizeSimpleActionResolution", "  const finalizeSimpleActionResolution = useCallback("),
    ("dice.ts", "finalizeScandalCardSpent", "  const finalizeScandalCardSpent = useCallback((instanceId: string) => {"),
    ("calamity.ts", "commitCalamityRoll", "  const commitCalamityRoll = (result: number, extras?: { calamityVariantKey?: string }) => {"),
    ("calamity.ts", "acceptCalamity", "  const handleAcceptCalamity = () => {"),
    ("dice.ts", "rollDieComplete", "  const handleRollDieComplete = (result: number, extras?: { calamityVariantKey?: string }) => {"),
    ("dice.ts", "rollDieCancel", "  const handleRollDieCancel = () => {"),
    ("turn.ts", "unstickPlay", "  const handleUnstickPlay = () => {"),
]

# original handle name → export (for same-file rewrites)
ORIG_TO_EXPORT = {marker.strip().split()[2]: export for _, export, marker in FUNCS}
# marker is `const NAME =` — parse NAME
ORIG_TO_EXPORT = {}
for _, export, marker in FUNCS:
    name = marker.strip().split()[1]
    ORIG_TO_EXPORT[name] = export

CROSS_ORIG = [
    "handleConfirmDiscardProperty",
    "handleEndTurn",
    "handleRollDieComplete",
    "handleIncomeComplete",
    "handleAcceptCalamity",
    "handlePlayCards",
    "handlePlotSelect",
    "handlePlotClaim",
    "handleUnstickPlay",
]


def scan_statement_end(src: str, start: int) -> int:
    i = start
    n = len(src)
    brace = 0
    paren = 0
    bracket = 0
    seen_eq = False
    seen_arrow = False
    seen_body = False
    in_str = None
    escape = False
    in_line = False
    in_block = False
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if in_line:
            if c == "\n":
                in_line = False
            i += 1
            continue
        if in_block:
            if c == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            i += 1
            continue
        if in_str:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_str:
                in_str = None
            i += 1
            continue
        if c in "\"'`":
            in_str = c
            i += 1
            continue
        if c == "/" and nxt == "/":
            in_line = True
            i += 2
            continue
        if c == "/" and nxt == "*":
            in_block = True
            i += 2
            continue
        if c == "=" and nxt == ">":
            seen_arrow = True
            i += 2
            continue
        if c == "=" and not seen_eq:
            seen_eq = True
            i += 1
            continue
        if c == "{":
            brace += 1
            if seen_arrow:
                seen_body = True
        elif c == "}":
            brace -= 1
        elif c == "(":
            paren += 1
        elif c == ")":
            paren -= 1
        elif c == "[":
            bracket += 1
        elif c == "]":
            bracket -= 1
        i += 1
        if seen_eq and seen_arrow and seen_body and brace == 0 and paren == 0 and bracket == 0:
            while i < n and src[i] in " \t":
                i += 1
            if i < n and src[i] == ";":
                i += 1
            if i < n and src[i] == "\n":
                i += 1
            return i
    raise RuntimeError("unterminated statement")


def unwrap_const(stmt: str, export_name: str) -> str:
    stmt = stmt.strip()
    eq = stmt.find("=")
    expr = stmt[eq + 1 :].strip().rstrip(";")
    if expr.startswith("useCallback"):
        inner_start = expr.find("(")
        depth = 0
        in_str = None
        escape = False
        last_comma = -1
        for i, c in enumerate(expr):
            if in_str:
                if escape:
                    escape = False
                elif c == "\\":
                    escape = True
                elif c == in_str:
                    in_str = None
                continue
            if c in "\"'`":
                in_str = c
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            elif c == "," and depth == 1:
                last_comma = i
        expr = expr[inner_start + 1 : last_comma].strip()
    arrow = expr.find("=>")
    if arrow < 0:
        raise RuntimeError(f"cannot unwrap: {stmt[:100]}")
    params = expr[:arrow].strip()
    body = expr[arrow + 2 :].strip()
    if not body.startswith("{"):
        body = "{\n    return " + body + "\n  }"
    param_inner = params[1:-1].strip() if params.startswith("(") else params
    prefix = f"export function {export_name}(s: PlaySession"
    if param_inner:
        prefix += f", {param_inner}"
    prefix += ")"
    return prefix + "\n" + body + "\n"


def rewrite_body(body: str, same_file_exports: dict[str, str], file: str) -> str:
    for orig, export in sorted(same_file_exports.items(), key=lambda x: -len(x[0])):
        body = body.replace(f"{orig}(", f"{export}(s, ")
    if file == "dice.ts":
        body = body.replace("commitCalamityRoll(", "commitCalamityRoll(s, ")
    for orig in CROSS_ORIG:
        if orig in same_file_exports:
            continue
        body = body.replace(f"{orig}(", f"getGameHandlers().{orig}(")
    return body


def insert_destructure(fn: str) -> str:
    brace = fn.find("{")
    return fn[: brace + 1] + "\n" + DESTRUCTURE + fn[brace + 1 :]


WRAPPER = {
    "handleGuestJoined": "  const handleGuestJoined = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => setup.guestJoined(sessionRef.current, gs, cfg), [])",
    "handleResumeHostTable": "  const handleResumeHostTable = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => setup.resumeHostTable(sessionRef.current, gs, cfg), [])",
    "handleCalamitySettled": "  const handleCalamitySettled = useCallback((info: { face: number; variant: { key: string; title: string; flavor: string } }) => calamity.calamitySettled(sessionRef.current, info), [])",
    "handleSetupComplete": "  const handleSetupComplete = (players: Player[], partyBoard?: PartyBoardSyncMeta) => setup.setupComplete(sessionRef.current, players, partyBoard)",
    "handlePlayCards": "  const handlePlayCards = (propertyInstanceId: string | null, actionInstanceIds: string[], convertToCashInstanceIds: string[], options?: PlayCardsOptions) => playCards.playCards(sessionRef.current, propertyInstanceId, actionInstanceIds, convertToCashInstanceIds, options)",
    "handlePlotSelect": "  const handlePlotSelect = (row: number, col: string) => plots.plotSelect(sessionRef.current, row, col)",
    "handleEndTurn": "  const handleEndTurn = () => turn.endTurn(sessionRef.current)",
    "handleDiscardComplete": "  const handleDiscardComplete = (discardedInstanceIds: string[]) => turn.discardComplete(sessionRef.current, discardedInstanceIds)",
    "handleCancelInvestmentSelect": "  const handleCancelInvestmentSelect = () => plots.cancelInvestmentSelect(sessionRef.current)",
    "handleCancelDiscardPropertySelect": "  const handleCancelDiscardPropertySelect = () => plots.cancelDiscardPropertySelect(sessionRef.current)",
    "handleToggleDiscardPropertySelection": "  const handleToggleDiscardPropertySelection = (propertyInstanceId: string) => plots.toggleDiscardPropertySelection(sessionRef.current, propertyInstanceId)",
    "handleConfirmDiscardProperty": "  const handleConfirmDiscardProperty = (selectedPropertyInstanceIds?: string[], actionInstanceIdOverride?: string) => plots.confirmDiscardProperty(sessionRef.current, selectedPropertyInstanceIds, actionInstanceIdOverride)",
    "handleInvestmentPlotSelect": "  const handleInvestmentPlotSelect = (row: number, col: string) => plots.investmentPlotSelect(sessionRef.current, row, col)",
    "handleCancelRemoveInvestorsSelect": "  const handleCancelRemoveInvestorsSelect = () => plots.cancelRemoveInvestorsSelect(sessionRef.current)",
    "handleRemoveInvestorsPlotSelect": "  const handleRemoveInvestorsPlotSelect = (row: number, col: string) => plots.removeInvestorsPlotSelect(sessionRef.current, row, col)",
    "handleActionCriteriaBank": "  const handleActionCriteriaBank = () => plots.actionCriteriaBank(sessionRef.current)",
    "handleCancelTakeoverSelect": "  const handleCancelTakeoverSelect = () => plots.cancelTakeoverSelect(sessionRef.current)",
    "handleCancelScandalSelect": "  const handleCancelScandalSelect = () => plots.cancelScandalSelect(sessionRef.current)",
    "handleCancelRezoning": "  const handleCancelRezoning = () => plots.cancelRezoning(sessionRef.current)",
    "handleCancelPlacement": "  const handleCancelPlacement = useCallback(() => plots.cancelPlacement(sessionRef.current), [])",
    "abortTaxBuildPrompt": "  const abortTaxBuildPrompt = useCallback(() => plots.abortTaxBuildPrompt(sessionRef.current), [])",
    "handleRezoningPropertyFromHand": "  const handleRezoningPropertyFromHand = (propertyInstanceId: string) => plots.rezoningPropertyFromHand(sessionRef.current, propertyInstanceId)",
    "handleRezoningHousingDensity": "  const handleRezoningHousingDensity = (highDensity: boolean) => plots.rezoningHousingDensity(sessionRef.current, highDensity)",
    "handleRezoningPlotSelect": "  const handleRezoningPlotSelect = (row: number, col: string) => plots.rezoningPlotSelect(sessionRef.current, row, col)",
    "handleTakeoverPlotSelect": "  const handleTakeoverPlotSelect = (row: number, col: string) => plots.takeoverPlotSelect(sessionRef.current, row, col)",
    "handleScandalPlotSelect": "  const handleScandalPlotSelect = (row: number, col: string) => plots.scandalPlotSelect(sessionRef.current, row, col)",
    "handlePlotClaim": "  const handlePlotClaim = (row: number, col: string) => plots.plotClaim(sessionRef.current, row, col)",
    "resetLocalUiToTitle": "  const resetLocalUiToTitle = () => setup.resetLocalUiToTitle(sessionRef.current)",
    "handleLeaveTable": "  const handleLeaveTable = () => setup.leaveTable(sessionRef.current)",
    "handleEndTable": "  const handleEndTable = () => setup.endTable(sessionRef.current)",
    "handleNewGame": "  const handleNewGame = () => setup.newGame(sessionRef.current)",
    "handleDoubleIncomeOrphanConfirmBank": "  const handleDoubleIncomeOrphanConfirmBank = () => income.doubleIncomeOrphanConfirmBank(sessionRef.current)",
    "handleIncomeComplete": "  const handleIncomeComplete = (earnedIncome: number, doubleIncomeInstanceId?: string, incomeResolution?: 'property-roll' | 'bank-income-card', dieFace?: number) => income.incomeComplete(sessionRef.current, earnedIncome, doubleIncomeInstanceId, incomeResolution, dieFace)",
    "handleIncomeCancel": "  const handleIncomeCancel = () => income.incomeCancel(sessionRef.current)",
    "handlePropertyClick": "  const handlePropertyClick = (row: number, col: string) => turn.propertyClick(sessionRef.current, row, col)",
    "handleVacantLotHint": "  const handleVacantLotHint = useCallback(() => turn.vacantLotHint(sessionRef.current), [])",
    "handleUndoLastAction": "  const handleUndoLastAction = () => turn.undoLastAction(sessionRef.current)",
    "handleUndoLastActionCancel": "  const handleUndoLastActionCancel = () => turn.undoLastActionCancel(sessionRef.current)",
    "finalizeCouncilFreezeAttackFailure": "  const finalizeCouncilFreezeAttackFailure = useCallback((instanceId: string, source: 'accept' | 'auto' = 'accept') => dice.finalizeCouncilFreezeAttackFailure(sessionRef.current, instanceId, source), [])",
    "handleAttackerDieSettled": "  const handleAttackerDieSettled = useCallback((natural: number) => dice.attackerDieSettled(sessionRef.current, natural), [])",
    "handleCouncilFreezeAttackerRollAgain": "  const handleCouncilFreezeAttackerRollAgain = useCallback(() => dice.councilFreezeAttackerRollAgain(sessionRef.current), [])",
    "handleCouncilFreezeFailDismiss": "  const handleCouncilFreezeFailDismiss = useCallback(() => dice.councilFreezeFailDismiss(sessionRef.current), [])",
    "finalizeSimpleActionResolution": "  const finalizeSimpleActionResolution = useCallback((instanceId: string, toastMessage: { type: 'success' | 'info' | 'error'; text: string }) => dice.finalizeSimpleActionResolution(sessionRef.current, instanceId, toastMessage), [])",
    "finalizeScandalCardSpent": "  const finalizeScandalCardSpent = useCallback((instanceId: string) => dice.finalizeScandalCardSpent(sessionRef.current, instanceId), [])",
    "commitCalamityRoll": "  const commitCalamityRoll = (result: number, extras?: { calamityVariantKey?: string }) => calamity.commitCalamityRoll(sessionRef.current, result, extras)",
    "handleAcceptCalamity": "  const handleAcceptCalamity = () => calamity.acceptCalamity(sessionRef.current)",
    "handleRollDieComplete": "  const handleRollDieComplete = (result: number, extras?: { calamityVariantKey?: string }) => dice.rollDieComplete(sessionRef.current, result, extras)",
    "handleRollDieCancel": "  const handleRollDieCancel = () => dice.rollDieCancel(sessionRef.current)",
    "handleUnstickPlay": "  const handleUnstickPlay = () => turn.unstickPlay(sessionRef.current)",
}

def main() -> None:
    src = GAME.read_text()
    by_file: dict[str, list[tuple[str, str]]] = {}
    replacements: list[tuple[int, int, str]] = []

    for file, export, marker in FUNCS:
        idx = src.find(marker)
        if idx < 0:
            raise SystemExit(f"marker not found: {marker[:60]}")
        end = scan_statement_end(src, idx)
        stmt = src[idx:end]
        orig = marker.strip().split()[1]
        fn = unwrap_const(stmt, export)
        by_file.setdefault(file, []).append((orig, fn))
        wrap = WRAPPER[orig]
        replacements.append((idx, end, wrap + "\n"))
        print(f"extract {orig} -> {file}::{export} ({end-idx} chars)")

    # write files
    file_origs: dict[str, dict[str, str]] = {}
    for file, export, marker in FUNCS:
        orig = marker.strip().split()[1]
        file_origs.setdefault(file, {})[orig] = export

    for file, parts in by_file.items():
        same = file_origs[file]
        out_fns = []
        header = SHARED
        if file == "calamity.ts":
            header = header.replace("import { commitCalamityRoll } from './calamity'\n", "")
        out_fns = []
        for orig, fn in parts:
            fn = insert_destructure(fn)
            brace = fn.find("{")
            fn = fn[: brace + 1] + rewrite_body(fn[brace + 1 :], same, file)
            out_fns.append(fn)
        (OUT / file).write_text(header + "\n" + "\n".join(out_fns))
        print("wrote", file, "fns", len(out_fns))

    # GameApp replacements from end
    replacements.sort(key=lambda t: t[0], reverse=True)
    for idx, end, wrap in replacements:
        src = src[:idx] + wrap + src[end:]

    GAME.write_text(src)
    print("patched GameApp, new len", len(src))


if __name__ == "__main__":
    main()

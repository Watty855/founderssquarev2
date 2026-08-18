'use client'

import type { Player, Plot } from '@/lib/types'
import { createSelectorStore } from '@/lib/selectorStore'

export type ActionCriteriaDialogState = {
  open: boolean
  actionInstanceId: string | null
  cardName: string
  bankValue: number
  reasonDescription: string
}

export function createClosedActionCriteriaDialog(): ActionCriteriaDialogState {
  return {
    open: false,
    actionInstanceId: null,
    cardName: '',
    bankValue: 0,
    reasonDescription: '',
  }
}

export type PlacementModeState = {
  active: boolean
  propertyCardId: string | null
  housingHighDensity?: boolean
  taxBuildActionInstanceId?: string
  wildCardEmulatePropertyId?: string
}

export type IncomeDialogState = {
  open: boolean
  player: Player | null
  totalIncome: number
  churchIncomeBonus: number
  churchBonusSourceLabels: string[]
  farmCoopIncomeBonus: number
  farmCoopBonusSourceLabels: string[]
  portAuthorityIncomeBonus: number
  portAuthorityBonusSourceLabels: string[]
  artsCouncilIncomeBonus: number
  artsCouncilBonusSourceLabels: string[]
  tourismOfficeIncomeBonus: number
  tourismOfficeBonusSourceLabels: string[]
  influencersIncomeBonus: number
  influencersBonusSourceLabels: string[]
  newsOutletIncomeBonus: number
  newsOutletBonusSourceLabels: string[]
  mafiaIncomeBonus: number
  mafiaBonusSourceLabels: string[]
  mafiaLevyTotal: number
  regulationBureauIncomeBonus: number
  regulationBureauBonusSourceLabels: string[]
  regulationBureauIncomePenalty: number
  rivalRegulationBureauPlotLabels: string[]
  unionIncomeBonus: number
  unionBonusSourceLabels: string[]
  unionIncomePenalty: number
  rivalUnionPlotLabels: string[]
  hasBuiltPropertiesForIncomeRoll: boolean
  actionInstanceId: string | null
}

export const closedIncomeDialog: IncomeDialogState = {
  open: false,
  player: null,
  totalIncome: 0,
  churchIncomeBonus: 0,
  churchBonusSourceLabels: [],
  farmCoopIncomeBonus: 0,
  farmCoopBonusSourceLabels: [],
  portAuthorityIncomeBonus: 0,
  portAuthorityBonusSourceLabels: [],
  artsCouncilIncomeBonus: 0,
  artsCouncilBonusSourceLabels: [],
  tourismOfficeIncomeBonus: 0,
  tourismOfficeBonusSourceLabels: [],
  influencersIncomeBonus: 0,
  influencersBonusSourceLabels: [],
  newsOutletIncomeBonus: 0,
  newsOutletBonusSourceLabels: [],
  mafiaIncomeBonus: 0,
  mafiaBonusSourceLabels: [],
  mafiaLevyTotal: 0,
  regulationBureauIncomeBonus: 0,
  regulationBureauBonusSourceLabels: [],
  regulationBureauIncomePenalty: 0,
  rivalRegulationBureauPlotLabels: [],
  unionIncomeBonus: 0,
  unionBonusSourceLabels: [],
  unionIncomePenalty: 0,
  rivalUnionPlotLabels: [],
  hasBuiltPropertiesForIncomeRoll: false,
  actionInstanceId: null,
}

export type RollDieMode =
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
  | 'calamity'

export type RollDieDialogState = {
  open: boolean
  mode: RollDieMode
  actionInstanceId: string | null
  targetPlayerId?: number
  influenceBonus?: number
  influenceLabels?: string[]
  councilFreezeAttackerRollsCompleted?: number
  councilFreezeAttackerLastNatural?: number
  councilFreezeFailAuto?: boolean
  diceRetryNonce?: number
  takeoverContext?: {
    row: number
    col: string
    ownerPlayerId: number
    payment120Million: number
  }
  rezoningContext?: {
    row: number
    col: string
    propertyInstanceId: string
    propertyCardId: string
    buildCost: number
    housingHighDensity?: boolean
  }
  scandalContext?: {
    row: number
    col: string
    anchorOwnerPlayerId: number
    anchorCardId: string
  }
  removeInvestorsContext?: {
    row: number
    col: string
  }
}

export const closedRollDieDialog: RollDieDialogState = {
  open: false,
  mode: 'roll-die',
  actionInstanceId: null,
}

export type PlotSelectMode = {
  active: boolean
  validPlots: Plot[]
  actionInstanceId: string | null
}

export type InvestmentSelectMode = PlotSelectMode & {
  contributionMillion: number
}

export type DiscardPropertySelectMode = {
  active: boolean
  actionInstanceId: string | null
  selectedPropertyInstanceIds: string[]
}

export type RezoningModeState =
  | { phase: 'inactive' }
  | { phase: 'pick-property'; actionInstanceId: string }
  | { phase: 'pick-housing-density'; actionInstanceId: string; propertyInstanceId: string }
  | {
      phase: 'pick-plot'
      actionInstanceId: string
      propertyInstanceId: string
      housingHighDensity?: boolean
    }

export type TaxBuildModeState =
  | { phase: 'inactive' }
  | { phase: 'pick-property'; actionInstanceId: string }

export type TaxBuildPromptState = {
  open: boolean
  propertyInstanceId: string | null
  housingHighDensity?: boolean
  actionInstanceId: string | null
  wildCardEmulatePropertyId?: string
}

export const taxPromptResumeRef: {
  current: {
    propertyInstanceId: string
    housingHighDensity?: boolean
    taxActionInstanceId: string
    wildCardEmulatePropertyId?: string
  } | null
} = { current: null }

export type CalamityAcceptPending = {
  face: number
  variantKey: string
  variantTitle: string
  variantFlavor: string
  percent: number
  lossMillion: number
  playerName: string
}

export type PlaySessionChrome = {
  isSpectator: boolean
  isCompactLayout: boolean
  isLandscapeLayout: boolean
  handRailPlayerId: number | null
  currentPlayerIsAi: boolean
}

export type PlayUiState = {
  placementMode: PlacementModeState
  incomeDialogState: IncomeDialogState
  doubleIncomeOrphanDialog: { open: boolean; instanceId: string | null }
  discardDialogState: { open: boolean; numToDiscard: number }
  undoActionDialogOpen: boolean
  rollDieDialogState: RollDieDialogState
  investmentSelectMode: InvestmentSelectMode
  removeInvestorsSelectMode: PlotSelectMode
  discardPropertySelectMode: DiscardPropertySelectMode
  discardPropertyConfirmOpen: boolean
  actionCriteriaDialog: ActionCriteriaDialogState
  takeoverSelectMode: PlotSelectMode
  scandalSelectMode: PlotSelectMode
  rezoningMode: RezoningModeState
  taxBuildMode: TaxBuildModeState
  taxBuildPrompt: TaxBuildPromptState
  calamityAcceptPending: CalamityAcceptPending | null
  session: PlaySessionChrome
}

export const EMPTY_PLOTS: Plot[] = []

const inactiveSelect: PlotSelectMode = {
  active: false,
  validPlots: EMPTY_PLOTS,
  actionInstanceId: null,
}

export const initialPlayUiState: PlayUiState = {
  placementMode: { active: false, propertyCardId: null },
  incomeDialogState: closedIncomeDialog,
  doubleIncomeOrphanDialog: { open: false, instanceId: null },
  discardDialogState: { open: false, numToDiscard: 0 },
  undoActionDialogOpen: false,
  rollDieDialogState: closedRollDieDialog,
  investmentSelectMode: { ...inactiveSelect, contributionMillion: 4 },
  removeInvestorsSelectMode: inactiveSelect,
  discardPropertySelectMode: {
    active: false,
    actionInstanceId: null,
    selectedPropertyInstanceIds: [],
  },
  discardPropertyConfirmOpen: false,
  actionCriteriaDialog: createClosedActionCriteriaDialog(),
  takeoverSelectMode: inactiveSelect,
  scandalSelectMode: inactiveSelect,
  rezoningMode: { phase: 'inactive' },
  taxBuildMode: { phase: 'inactive' },
  taxBuildPrompt: {
    open: false,
    propertyInstanceId: null,
    actionInstanceId: null,
  },
  calamityAcceptPending: null,
  session: {
    isSpectator: false,
    isCompactLayout: false,
    isLandscapeLayout: false,
    handRailPlayerId: null,
    currentPlayerIsAi: false,
  },
}

const playUi = createSelectorStore<PlayUiState>(initialPlayUiState)

export const getPlayUiSnapshot = playUi.getSnapshot
export const subscribePlayUi = playUi.subscribe
export const usePlayUiStore = playUi.useStore

function patch(partial: Partial<PlayUiState>) {
  playUi.setState({ ...playUi.getSnapshot(), ...partial })
}

function fieldSetter<K extends keyof PlayUiState>(key: K) {
  return (next: PlayUiState[K] | ((prev: PlayUiState[K]) => PlayUiState[K])) => {
    const prev = playUi.getSnapshot()[key]
    const value = typeof next === 'function' ? (next as (p: PlayUiState[K]) => PlayUiState[K])(prev) : next
    if (value === prev) return
    patch({ [key]: value } as unknown as Partial<PlayUiState>)
  }
}

export const setPlacementMode = fieldSetter('placementMode')
export const setIncomeDialogState = fieldSetter('incomeDialogState')
export const setDoubleIncomeOrphanDialog = fieldSetter('doubleIncomeOrphanDialog')
export const setDiscardDialogState = fieldSetter('discardDialogState')
export const setUndoActionDialogOpen = fieldSetter('undoActionDialogOpen')
export const setRollDieDialogState = fieldSetter('rollDieDialogState')
export const setInvestmentSelectMode = fieldSetter('investmentSelectMode')
export const setRemoveInvestorsSelectMode = fieldSetter('removeInvestorsSelectMode')
export const setDiscardPropertySelectMode = fieldSetter('discardPropertySelectMode')
export const setDiscardPropertyConfirmOpen = fieldSetter('discardPropertyConfirmOpen')
export const setActionCriteriaDialog = fieldSetter('actionCriteriaDialog')
export const setTakeoverSelectMode = fieldSetter('takeoverSelectMode')
export const setScandalSelectMode = fieldSetter('scandalSelectMode')
export const setRezoningMode = fieldSetter('rezoningMode')
export const setTaxBuildMode = fieldSetter('taxBuildMode')
export const setTaxBuildPrompt = fieldSetter('taxBuildPrompt')
export const setCalamityAcceptPending = fieldSetter('calamityAcceptPending')

export function setPlaySession(session: PlaySessionChrome) {
  const prev = playUi.getSnapshot().session
  if (
    prev.isSpectator === session.isSpectator &&
    prev.isCompactLayout === session.isCompactLayout &&
    prev.isLandscapeLayout === session.isLandscapeLayout &&
    prev.handRailPlayerId === session.handRailPlayerId &&
    prev.currentPlayerIsAi === session.currentPlayerIsAi
  ) {
    return
  }
  patch({ session })
}

export function resetPlayUiStore() {
  const session = playUi.getSnapshot().session
  playUi.setState({ ...initialPlayUiState, session })
}

export function isPlayUiBlockingTurnAdvance(ui: PlayUiState): boolean {
  return (
    ui.rollDieDialogState.open ||
    ui.incomeDialogState.open ||
    ui.discardDialogState.open ||
    ui.placementMode.active ||
    ui.rezoningMode.phase !== 'inactive' ||
    ui.taxBuildMode.phase !== 'inactive' ||
    ui.taxBuildPrompt.open ||
    ui.takeoverSelectMode.active ||
    ui.scandalSelectMode.active ||
    ui.investmentSelectMode.active ||
    ui.removeInvestorsSelectMode.active ||
    ui.discardPropertySelectMode.active ||
    ui.actionCriteriaDialog.open
  )
}

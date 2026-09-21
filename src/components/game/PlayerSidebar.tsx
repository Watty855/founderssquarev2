'use client'

import type { CSSProperties } from 'react'
import { Anchor, ArrowCounterClockwise, BookOpen, Gavel, House } from '@phosphor-icons/react'
import { ChromeDimmer } from '@/components/game/ChromeDimmer'
import { SidebarHandFlightAnchors } from '@/components/game/SidebarHandFlightAnchors'
import { canUndoLastAction } from '@/lib/undoLastAction'
import { isPlayerIncomeFrozen } from '@/lib/freezeAssets'
import { calculateFinalScores, playerIncomePerTurn } from '@/lib/playerWealth'
import { useGameTableStore } from '@/lib/gameTableStore'
import { usePlayUiStore, setUndoActionDialogOpen } from '@/lib/playUiStore'
import { setActionCardsOpen, setAnchorTenetsOpen, setPropertyTypesOpen, setRulesQuickOpen } from '@/lib/gameOverlayStore'
import type { Player } from '@/lib/types'

const boardHudIconButtonClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8] transition-colors hover:border-[#c9a85c]/45 hover:bg-[#1a1a24] hover:text-[#f5ecd7] disabled:opacity-35 disabled:pointer-events-none disabled:hover:border-white/12 disabled:hover:bg-white/[0.04] disabled:hover:text-[#a8b0c8]'

export function PlayerSidebar() {
  const players = useGameTableStore((s) => s.players)
  const plots = useGameTableStore((s) => s.plots)
  const currentPlayerIndex = useGameTableStore((s) => s.currentPlayerIndex)
  const undoLastAction = useGameTableStore((s) => s.undoLastAction)
  const session = usePlayUiStore((s) => s.session)
  const handRailPlayerId = session.handRailPlayerId
  const compact = session.isCompactLayout
  const isSpectator = session.isSpectator

  const acting = players[currentPlayerIndex]
  const handInteractionsActive =
    !isSpectator && handRailPlayerId === acting?.id && acting?.isAi !== true
  const gs = useGameTableStore((s) => s)
  const diceResolutionOpen = usePlayUiStore(
    (s) =>
      s.rollDieDialogState.open || s.incomeDialogState.open || s.calamityAcceptPending != null
  )
  const undoLastActionAvailable = canUndoLastAction(gs, {
    handInteractionsActive,
    isSpectator,
    diceResolutionOpen,
  })
  const scores = calculateFinalScores({ players, plots })
  const scoreById = new Map(scores.map((s) => [s.player.id, s]))
  const statsFor = (player: Player) => {
    const score = scoreById.get(player.id)
    return {
      cash: score?.cashInHand ?? player.money,
      propertyValue: score?.propertyValue ?? 0,
      standingTotal: score?.totalScore ?? player.money,
      income: playerIncomePerTurn(plots, player.id),
    }
  }

  const hudButtons = (size: number, compactBtns: boolean) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: compactBtns ? 'flex-start' : 'space-between',
        gap: compactBtns ? 4 : 3,
        flexShrink: 0,
        minWidth: 0,
        width: compactBtns ? undefined : '100%',
        ...(isSpectator ? { pointerEvents: 'auto' } : undefined),
      }}
    >
      <button
        type="button"
        aria-label="Undo last action"
        title={
          undoLastActionAvailable
            ? `Undo: ${undoLastAction?.label ?? 'last action'}`
            : 'No action to undo this turn'
        }
        disabled={!undoLastActionAvailable}
        onClick={() => setUndoActionDialogOpen(true)}
        className={boardHudIconButtonClass}
        style={{ height: 32, width: 32 }}
      >
        <ArrowCounterClockwise size={size} weight="duotone" />
      </button>
      <button
        type="button"
        aria-label="Open quick rules"
        title="Quick rules"
        onClick={() => setRulesQuickOpen(true)}
        className={
          compactBtns
            ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8]'
            : 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8] transition-colors hover:border-[#5ac8fa]/40 hover:bg-[#1a1a24] hover:text-[#e0e8ff]'
        }
      >
        <BookOpen size={size} weight="duotone" />
      </button>
      <button
        type="button"
        aria-label="Open Property Types summary"
        title="Property Types"
        onClick={() => setPropertyTypesOpen(true)}
        className={
          compactBtns
            ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#7eb8e8]'
            : 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#7eb8e8]/25 bg-[#7eb8e8]/[0.06] text-[#7eb8e8] transition-colors hover:border-[#7eb8e8]/55 hover:bg-[#7eb8e8]/[0.12] hover:text-[#c5e4f8]'
        }
      >
        <House size={size} weight="duotone" />
      </button>
      <button
        type="button"
        aria-label="Open Anchor Tenets summary"
        title="Anchor Tenets"
        onClick={() => setAnchorTenetsOpen(true)}
        className={
          compactBtns
            ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#d8b75a]'
            : 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d8b75a]/25 bg-[#d8b75a]/[0.06] text-[#d8b75a] transition-colors hover:border-[#d8b75a]/55 hover:bg-[#d8b75a]/[0.12] hover:text-[#f1df9d]'
        }
      >
        <Anchor size={size} weight="duotone" />
      </button>
      <button
        type="button"
        aria-label="Open Action Cards reference"
        title="Action Cards"
        onClick={() => setActionCardsOpen(true)}
        className={
          compactBtns
            ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#c4b5fd]'
            : 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#c4b5fd]/25 bg-[#c4b5fd]/[0.06] text-[#c4b5fd] transition-colors hover:border-[#c4b5fd]/55 hover:bg-[#c4b5fd]/[0.12] hover:text-[#ddd6fe]'
        }
      >
        <Gavel size={size} weight="duotone" />
      </button>
    </div>
  )

  if (compact) {
    return (
      <ChromeDimmer
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, #0a0a0a 0%, #121212 100%)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {hudButtons(16, true)}
        {players.map((player, index) => {
          const isActive = index === currentPlayerIndex
          const stats = statsFor(player)
          const assetsFrozen = isPlayerIncomeFrozen(gs, player.id)
          return (
            <div
              key={player.id}
              title={`${player.name}.${assetsFrozen ? ' Assets frozen — no property Income or investment payouts until this turn ends.' : ''} Cash $${stats.cash}M (banked cards count; Calamity hits cash). Property $${stats.propertyValue}M (built lots + investments). Total $${stats.standingTotal}M. Unplayed hand cards do not score.`}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 999,
                border: isActive ? `1.5px solid ${player.color}` : '1px solid rgba(255,255,255,0.1)',
                background: isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                boxShadow: isActive ? `0 0 12px ${player.color}44` : undefined,
                maxWidth: 280,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: player.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? player.color : '#fff' }}>
                {player.name}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(248,250,252,0.75)', fontVariantNumeric: 'tabular-nums' }}>
                ${stats.cash}M
              </span>
              <span style={{ fontSize: 10, color: 'rgba(186, 214, 247, 0.9)', fontVariantNumeric: 'tabular-nums' }}>
                ${stats.propertyValue}M
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                ${stats.standingTotal}M
              </span>
              {isActive ? (
                <span style={{ fontSize: 10, color: '#fef9c3', fontVariantNumeric: 'tabular-nums' }}>
                  ${stats.income}M/t
                </span>
              ) : null}
              {assetsFrozen ? (
                <span
                  title="Freeze Assets: no property Income or investment payouts until this turn ends"
                  style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: '#fecaca', textTransform: 'uppercase' }}
                >
                  Frozen
                </span>
              ) : null}
              {player.id !== handRailPlayerId ? <SidebarHandFlightAnchors player={player} /> : null}
            </div>
          )
        })}
      </ChromeDimmer>
    )
  }

  return (
    <ChromeDimmer
      style={{
        width: 188,
        flexShrink: 0,
        padding: '14px 8px',
        overflowY: 'auto',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #121212 52%, #080808 100%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hudButtons(18, false)}
        {players.map((player, index) => {
          const isActive = index === currentPlayerIndex
          const stats = statsFor(player)
          const assetsFrozen = isPlayerIncomeFrozen(gs, player.id)
          const showSidebarAnchors = player.id !== handRailPlayerId
          const handCounts = `${player.propertyCards.length} property and ${player.actionCards.length} action cards in hand`
          const handNote = showSidebarAnchors
            ? `${handCounts}. Card flights land at this player's row — backs only.`
            : `${handCounts}. Main table hand strip below.`
          const statusSummary = `${player.name}.${isActive ? ' Current turn.' : ''}${assetsFrozen ? ' Assets frozen — no property Income or investment payouts until this turn ends.' : ''} Cash ${stats.cash} million dollars. Property ${stats.propertyValue} million dollars including investments. Standing total ${stats.standingTotal} million dollars. Income ${stats.income} million dollars per turn. Unplayed cards in hand are not scored. ${handNote}`
          return (
            <article
              key={player.id}
              role="region"
              aria-label={statusSummary}
              tabIndex={0}
              style={{
                position: 'relative',
                overflow: 'visible',
                padding: isActive ? 12 : 10,
                borderRadius: 10,
                borderLeft: `3px solid ${isActive ? player.color : 'transparent'}`,
                backgroundColor: isActive ? 'rgba(0, 0, 0, 0.14)' : 'transparent',
                opacity: isActive ? 1 : 0.72,
                transition: 'all 300ms ease',
                outline: 'none',
                ...(isActive ? ({ '--player-color': player.color } as CSSProperties) : {}),
              }}
              className={isActive ? 'player-panel-active' : ''}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: player.color,
                    flexShrink: 0,
                  }}
                />
                <p
                  style={{
                    fontSize: isActive ? 14 : 12,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: isActive ? player.color : '#ffffff',
                    textShadow: isActive
                      ? `0 0 10px ${player.color}66`
                      : '0 1px 3px rgba(0, 0, 0, 0.55)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {player.name}
                </p>
                {assetsFrozen ? (
                  <span
                    title="Freeze Assets: no property Income or investment payouts until this turn ends"
                    style={{
                      marginLeft: 'auto',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#fecaca',
                    }}
                  >
                    Frozen
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  marginTop: isActive ? 10 : 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: isActive ? 11 : 10,
                }}
                aria-hidden
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}
                    title="Treasury. Banked cards add here and are exposed to Calamity."
                  >
                    Cash
                  </span>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    ${stats.cash}M
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}
                    title="Built lots plus your investments. Unplayed cards in hand are not included."
                  >
                    Property
                  </span>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    ${stats.propertyValue}M
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}
                    title="Cash + property + Square/Street bonuses if already earned."
                  >
                    Total
                  </span>
                  <span style={{ fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    ${stats.standingTotal}M
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}>Income</span>
                  <span style={{ fontWeight: 600, color: '#fef9c3', fontVariantNumeric: 'tabular-nums' }}>
                    ${stats.income}M/turn
                  </span>
                </div>
              </div>
              {showSidebarAnchors ? <SidebarHandFlightAnchors player={player} /> : null}
            </article>
          )
        })}
      </div>
    </ChromeDimmer>
  )
}

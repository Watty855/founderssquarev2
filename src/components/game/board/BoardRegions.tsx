'use client'

import { memo } from 'react'
import { BOARD_REGIONS, type BoardRegionId } from '@/lib/boardGeometry'
import { CHURCH_BLOCK_FILL, bleedLabelPx } from './boardLotVisuals'

/**
 * Free-canvas named regions — everything outside the static track.
 *
 * Art-direct here, independently of game logic:
 *   - `BLEED_ART` styles the outer bleed band (title art, edition marks,
 *     side panels). Each strip keeps its district identity so players can
 *     still orient Mountain Cove / Farmland / Riverfront / Railway.
 *   - The inner court (church block) is a quiet visual — no overlay copy.
 */

type BleedArt = {
  /** Main label running along the strip. */
  label: string
  /** Small edition / flavor mark. */
  mark?: string
  bg: string
  accent: string
}

export const BLEED_ART: Record<Exclude<BoardRegionId, 'court'>, BleedArt> = {
  'bleed.north': { label: 'Mountain Cove', mark: 'Founders Square · Table Edition', bg: '#3a2e1e', accent: '#8a7a5a' },
  'bleed.south': { label: 'Farmland', mark: 'Build · Influence · Prosper', bg: '#1e4020', accent: '#5aaa5a' },
  'bleed.west': { label: 'Riverfront', bg: '#0e3560', accent: '#4a9ad0' },
  'bleed.east': { label: 'Railway District', bg: '#35354a', accent: '#b0b0cc' },
}

type BoardRegionsProps = {
  cityCellPx: number
  compact: boolean
}

function BleedStrip({
  id,
  fontSize,
}: {
  id: Exclude<BoardRegionId, 'court'>
  fontSize: number
}) {
  const region = BOARD_REGIONS[id]
  const art = BLEED_ART[id]
  const vertical = id === 'bleed.west' || id === 'bleed.east'
  const nestedTitle =
    id === 'bleed.north'
      ? 'bleed.north.title'
      : id === 'bleed.west'
        ? 'bleed.west.panel'
        : id === 'bleed.east'
          ? 'bleed.east.panel'
          : undefined
  const nestedMark =
    id === 'bleed.north' ? 'bleed.north.edition' : id === 'bleed.south' ? 'bleed.south.tagline' : undefined
  return (
    <div
      data-region={id}
      title={art.label}
      style={{
        gridColumn: region.gridColumn,
        gridRow: region.gridRow,
        backgroundColor: art.bg,
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        overflow: 'hidden',
        padding: vertical ? '8px 1px' : '1px 8px',
        borderTop: id === 'bleed.north' ? `2px solid ${art.accent}55` : undefined,
        borderBottom: id === 'bleed.south' ? `2px solid ${art.accent}55` : undefined,
        borderLeft: id === 'bleed.west' ? `2px solid ${art.accent}55` : undefined,
        borderRight: id === 'bleed.east' ? `2px solid ${art.accent}55` : undefined,
        boxShadow: `inset 0 0 12px ${art.accent}18`,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      <span
        data-region={nestedTitle}
        style={{
          fontSize,
          fontWeight: 800,
          color: art.accent,
          letterSpacing: vertical ? '0.08em' : '0.1em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          lineHeight: 1.05,
          textShadow: `0 1px 3px rgba(0,0,0,0.65), 0 0 8px ${art.accent}44`,
          writingMode: vertical ? 'vertical-rl' : undefined,
          textOrientation: vertical ? 'mixed' : undefined,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {art.label}
      </span>
      {art.mark ? (
        <span
          data-region={nestedMark}
          style={{
            fontSize: Math.max(4, fontSize - 2),
            fontWeight: 600,
            color: `${art.accent}aa`,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {art.mark}
        </span>
      ) : null}
    </div>
  )
}

/** Inner court — stained church block, no overlay copy. */
function InnerCourt() {
  const region = BOARD_REGIONS.court
  return (
    <div
      data-region="court"
      style={{
        gridColumn: region.gridColumn,
        gridRow: region.gridRow,
        background: CHURCH_BLOCK_FILL,
        border: '2px solid rgba(120,220,150,0.45)',
        boxShadow: '0 0 24px rgba(100,200,120,0.25), inset 0 0 18px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        zIndex: 2,
        pointerEvents: 'none',
        cursor: 'not-allowed',
      }}
    />
  )
}

function BoardRegionsImpl({ cityCellPx, compact }: BoardRegionsProps) {
  const fs = bleedLabelPx(cityCellPx, compact)
  return (
    <div data-layer="regions" style={{ display: 'contents' }}>
      <BleedStrip id="bleed.north" fontSize={fs} />
      <BleedStrip id="bleed.south" fontSize={fs} />
      <BleedStrip id="bleed.west" fontSize={fs} />
      <BleedStrip id="bleed.east" fontSize={fs} />
      <InnerCourt />
    </div>
  )
}

export const BoardRegions = memo(BoardRegionsImpl)

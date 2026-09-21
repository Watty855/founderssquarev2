'use client'

import type { CalamityOutcomeFields, CalamityVariant } from '@/lib/calamity'

/** Base calamity copy was ~16px; player name is 2×, die/loss result is 3×. */
const PLAYER_NAME_PX = 'clamp(26px, 3.6vw, 32px)'
const RESULT_PX = 'clamp(39px, 5.4vw, 48px)'
const FLAVOR_PX = 'clamp(13px, 1.8vw, 16px)'

export function calamityOutcomeFromVariant(
  fields: Omit<CalamityOutcomeFields, 'variantTitle' | 'variantFlavor'> & { variant: CalamityVariant }
): CalamityOutcomeFields {
  return {
    playerName: fields.playerName,
    face: fields.face,
    percent: fields.percent,
    lossMillion: fields.lossMillion,
    variantTitle: fields.variant.title,
    variantFlavor: fields.variant.flavor,
  }
}

/** Shared calamity outcome type: large roller name, even larger die/loss result. */
export function CalamityOutcomeBody({
  playerName,
  face,
  percent,
  lossMillion,
  variantTitle,
  variantFlavor,
}: CalamityOutcomeFields) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <p
        style={{
          margin: 0,
          fontSize: PLAYER_NAME_PX,
          fontWeight: 800,
          lineHeight: 1.15,
          color: 'rgba(254, 226, 226, 0.98)',
          letterSpacing: '0.04em',
        }}
      >
        {playerName}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: RESULT_PX,
          fontWeight: 800,
          lineHeight: 1.1,
          color: '#fff',
          letterSpacing: '0.02em',
        }}
      >
        {face != null ? `Rolled ${face}` : 'Calamity'}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: RESULT_PX,
          fontWeight: 800,
          lineHeight: 1.1,
          color: '#fecaca',
        }}
      >
        {percent}% · −${lossMillion}M
      </p>
      <p
        style={{
          margin: '6px 0 0',
          fontSize: FLAVOR_PX,
          fontWeight: 700,
          color: 'rgba(254, 226, 226, 0.95)',
        }}
      >
        {variantTitle}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: FLAVOR_PX,
          fontWeight: 600,
          color: 'rgba(254, 226, 226, 0.88)',
          lineHeight: 1.45,
          maxWidth: '36rem',
        }}
      >
        {variantFlavor}
      </p>
    </div>
  )
}

'use client'

import { Scales } from '@phosphor-icons/react'
import {
  FREEZE_ASSETS_BANK_VALUE,
  FREEZE_ASSETS_LEGAL_ACTION,
  FREEZE_ASSETS_PLAY_COST,
} from '@/lib/freezeAssets'

export function FreezeAssetsLegalIcon({ size = 52 }: { size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 35% 30%, rgba(252, 211, 77, 0.35), rgba(120, 53, 15, 0.9) 70%)',
        border: '2px solid rgba(252, 211, 77, 0.55)',
        boxShadow: '0 0 0 4px rgba(120, 53, 15, 0.35), 0 8px 20px rgba(0,0,0,0.45)',
        color: '#fde68a',
        flexShrink: 0,
      }}
    >
      <Scales size={Math.round(size * 0.55)} weight="fill" />
    </div>
  )
}

export function FreezeAssetsPlayPrompt({
  canPay,
  onPay,
  onBank,
  onCancel,
  compact = false,
}: {
  canPay: boolean
  onPay: () => void
  onBank: () => void
  onCancel: () => void
  compact?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <FreezeAssetsLegalIcon size={compact ? 44 : 52} />
        <p
          style={{
            margin: 0,
            fontSize: compact ? 12 : 13,
            lineHeight: 1.45,
            color: '#e8e4d4',
            fontWeight: 500,
          }}
        >
          {FREEZE_ASSETS_LEGAL_ACTION}
        </p>
      </div>
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: '#9a9484' }}>
        One complete round — you are included. Income cards may still be banked.
      </p>
      <button
        type="button"
        onClick={onPay}
        disabled={!canPay}
        className="btn-ps"
        style={{
          height: 42,
          borderRadius: 10,
          backgroundColor: canPay ? '#b45309' : '#333348',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          border: '2px solid transparent',
          cursor: canPay ? 'pointer' : 'not-allowed',
          opacity: canPay ? 1 : 0.55,
        }}
      >
        Pay ${FREEZE_ASSETS_PLAY_COST}M to play
      </button>
      <button
        type="button"
        onClick={onBank}
        style={{
          height: 42,
          borderRadius: 10,
          backgroundColor: 'transparent',
          color: '#f0f0f5',
          fontSize: 14,
          fontWeight: 500,
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
        }}
      >
        Bank for ${FREEZE_ASSETS_BANK_VALUE}M
      </button>
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
  )
}

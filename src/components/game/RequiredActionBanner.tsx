'use client'

import { useEffect, useState } from 'react'

export type RequiredActionTone = 'info' | 'warning' | 'danger' | 'success'

export interface RequiredAction {
  /** Stable id, used as the React key so the banner re-mounts (re-pulses) on step changes. */
  id: string
  title: string
  detail?: string
  /** Visual tone — danger reserved for blocking dice flows that consume real resources. */
  tone: RequiredActionTone
  /** Short label like "Roll Die" or "Pick a target". Acts as the primary call-to-action shown on the banner. */
  ctaLabel?: string
  /** Optional click handler for the primary CTA. If omitted, the CTA is shown but disabled (the actual click target is in the dialog or board). */
  onCta?: () => void
  /** Show a Cancel button if cancellation is allowed for this step. */
  cancelLabel?: string
  onCancel?: () => void
}

interface RequiredActionBannerProps {
  action: RequiredAction | null
  /** `boardStrip`: horizontal bar below row 21 (columns C–S). `boardDock`: legacy compact dock. */
  layout?: 'header' | 'boardDock' | 'boardStrip'
}

const TONE_STYLES: Record<RequiredActionTone, {
  background: string
  borderColor: string
  ringColor: string
  pulseColor: string
  iconBackground: string
  iconColor: string
  titleColor: string
  detailColor: string
  ctaBackground: string
  ctaColor: string
  ctaBorder: string
}> = {
  info: {
    background: 'rgba(30, 174, 219, 0.18)',
    borderColor: 'rgba(30, 174, 219, 0.45)',
    ringColor: 'rgba(30, 174, 219, 0.55)',
    pulseColor: '#7dd3fc',
    iconBackground: 'rgba(30, 174, 219, 0.25)',
    iconColor: '#7dd3fc',
    titleColor: '#bae6fd',
    detailColor: 'rgba(186, 230, 253, 0.78)',
    ctaBackground: 'rgba(30, 174, 219, 0.95)',
    ctaColor: '#031b25',
    ctaBorder: 'rgba(125, 211, 252, 0.85)',
  },
  warning: {
    background: 'rgba(251, 191, 36, 0.18)',
    borderColor: 'rgba(251, 191, 36, 0.55)',
    ringColor: 'rgba(251, 191, 36, 0.6)',
    pulseColor: '#fcd34d',
    iconBackground: 'rgba(251, 191, 36, 0.28)',
    iconColor: '#fcd34d',
    titleColor: '#fde68a',
    detailColor: 'rgba(253, 230, 138, 0.78)',
    ctaBackground: '#fbbf24',
    ctaColor: '#1f1300',
    ctaBorder: '#fcd34d',
  },
  danger: {
    background: 'rgba(248, 113, 113, 0.18)',
    borderColor: 'rgba(248, 113, 113, 0.55)',
    ringColor: 'rgba(248, 113, 113, 0.65)',
    pulseColor: '#fca5a5',
    iconBackground: 'rgba(248, 113, 113, 0.28)',
    iconColor: '#fca5a5',
    titleColor: '#fecaca',
    detailColor: 'rgba(254, 202, 202, 0.78)',
    ctaBackground: '#f87171',
    ctaColor: '#250505',
    ctaBorder: '#fca5a5',
  },
  success: {
    background: 'rgba(34, 197, 94, 0.18)',
    borderColor: 'rgba(34, 197, 94, 0.5)',
    ringColor: 'rgba(34, 197, 94, 0.55)',
    pulseColor: '#86efac',
    iconBackground: 'rgba(34, 197, 94, 0.28)',
    iconColor: '#86efac',
    titleColor: '#bbf7d0',
    detailColor: 'rgba(187, 247, 208, 0.78)',
    ctaBackground: '#22c55e',
    ctaColor: '#04210d',
    ctaBorder: '#86efac',
  },
}

export function RequiredActionBanner({ action, layout = 'header' }: RequiredActionBannerProps) {
  /** Re-mount the banner when the step changes so the entrance animation runs. */
  const [mountedId, setMountedId] = useState<string | null>(null)
  useEffect(() => {
    if (action && action.id !== mountedId) {
      setMountedId(action.id)
    } else if (!action && mountedId !== null) {
      setMountedId(null)
    }
  }, [action, mountedId])

  if (!action) return null

  const tone = TONE_STYLES[action.tone]
  const dock = layout === 'boardDock'
  const strip = layout === 'boardStrip'
  const compact = dock || strip

  return (
    <div
      key={action.id}
      role="alert"
      aria-live="assertive"
      style={{
        position: 'relative',
        padding: strip ? '6px 12px' : dock ? '9px 11px' : '14px 32px',
        backgroundColor: compact ? 'rgba(12, 14, 22, 0.92)' : tone.background,
        borderRadius: strip ? 10 : dock ? 12 : 0,
        border: compact ? `1px solid ${tone.borderColor}` : undefined,
        borderTop: compact ? undefined : `1px solid ${tone.borderColor}`,
        borderBottom: compact ? undefined : `1px solid ${tone.borderColor}`,
        backdropFilter: compact ? 'blur(10px)' : undefined,
        WebkitBackdropFilter: compact ? 'blur(10px)' : undefined,
        boxShadow: compact
          ? `inset 0 0 0 1px ${tone.ringColor}, 0 12px 36px -14px rgba(0,0,0,0.85)`
          : `inset 0 0 0 1px ${tone.ringColor}, 0 8px 24px -12px rgba(0,0,0,0.6)`,
        animation: 'fsRequiredBannerPulse 2.4s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes fsRequiredBannerPulse {
          0%, 100% {
            box-shadow:
              inset 0 0 0 1px ${tone.ringColor},
              0 0 0 0 ${tone.ringColor}00,
              0 8px 24px -12px rgba(0, 0, 0, 0.6);
          }
          50% {
            box-shadow:
              inset 0 0 0 1px ${tone.ringColor},
              0 0 24px 0 ${tone.ringColor}55,
              0 8px 24px -12px rgba(0, 0, 0, 0.6);
          }
        }
        @keyframes fsRequiredBannerDot {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.4); opacity: 1; }
        }
        :global(.fs-required-banner-cta) {
          transition: transform 120ms ease, filter 120ms ease;
        }
        :global(.fs-required-banner-cta:hover) {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: strip ? 'center' : dock ? 'flex-start' : 'center',
          flexDirection: strip ? 'row' : dock ? 'column' : 'row',
          gap: strip ? 10 : dock ? 8 : 16,
          maxWidth: compact ? '100%' : 1280,
          margin: compact ? 0 : '0 auto',
          width: compact ? '100%' : undefined,
        }}
      >
        <div
          aria-hidden
          style={{
            flexShrink: 0,
            width: strip ? 22 : dock ? 28 : 36,
            height: strip ? 22 : dock ? 28 : 36,
            borderRadius: 999,
            backgroundColor: tone.iconBackground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              backgroundColor: tone.pulseColor,
              animation: 'fsRequiredBannerDot 1.2s ease-in-out infinite',
              display: 'block',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {strip ? (
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.35,
                color: tone.titleColor,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <span style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Action required:
              </span>{' '}
              <span style={{ color: tone.titleColor }}>{action.title}</span>
              {action.detail ? (
                <span style={{ fontWeight: 500, color: tone.detailColor }}> — {action.detail}</span>
              ) : null}
            </p>
          ) : (
            <>
              <p
                style={{
                  margin: 0,
                  fontSize: dock ? 11 : 14,
                  fontWeight: 700,
                  letterSpacing: dock ? '0.08em' : '0.04em',
                  textTransform: 'uppercase',
                  color: tone.titleColor,
                  lineHeight: dock ? 1.25 : undefined,
                }}
              >
                Action required: {action.title}
              </p>
              {action.detail ? (
                <p
                  style={{
                    margin: dock ? '3px 0 0' : '4px 0 0',
                    fontSize: dock ? 11 : 13,
                    fontWeight: 500,
                    lineHeight: 1.45,
                    color: tone.detailColor,
                  }}
                >
                  {action.detail}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: strip ? 6 : 8,
            flexShrink: 0,
            flexWrap: strip ? 'nowrap' : 'wrap',
            alignSelf: dock ? 'stretch' : undefined,
          }}
        >
          {action.ctaLabel ? (
            <button
              type="button"
              onClick={action.onCta}
              disabled={!action.onCta}
              className="fs-required-banner-cta"
              style={{
                height: strip ? 28 : dock ? 30 : 34,
                padding: strip ? '0 10px' : dock ? '0 12px' : '0 16px',
                borderRadius: 999,
                backgroundColor: action.onCta ? tone.ctaBackground : 'rgba(255,255,255,0.06)',
                color: action.onCta ? tone.ctaColor : 'rgba(255,255,255,0.6)',
                border: `1px solid ${action.onCta ? tone.ctaBorder : 'rgba(255,255,255,0.15)'}`,
                fontSize: strip ? 10 : dock ? 10 : 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: action.onCta ? 'pointer' : 'default',
              }}
            >
              {action.ctaLabel}
            </button>
          ) : null}
          {action.cancelLabel ? (
            <button
              type="button"
              onClick={action.onCancel}
              style={{
                height: strip ? 28 : dock ? 30 : 34,
                padding: strip ? '0 10px' : dock ? '0 10px' : '0 14px',
                borderRadius: 999,
                backgroundColor: 'transparent',
                color: 'rgba(240,240,245,0.7)',
                border: '1px solid rgba(255,255,255,0.18)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
            >
              {action.cancelLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

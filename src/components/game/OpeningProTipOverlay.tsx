'use client'

const TIPS = [
  'Choose a property to build each turn — Find strength building in community.',
  'Play income action each turn.',
  'Seek to establish influence around the city by building an Anchor Tenet (light blue cards).',
] as const

/** Shown on the board grid (F4–P18) for 20s after the opening narration. */
export function OpeningProTipOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Pro-Tip"
      className="pointer-events-none flex h-full w-full min-h-0 items-stretch justify-stretch p-1"
    >
      <div
        className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-lg border-2 border-sky-400/50 shadow-[0_0_48px_rgba(30,174,219,0.35),0_12px_40px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(125,211,252,0.25)]"
        style={{
          background: 'linear-gradient(165deg, rgba(10,18,32,0.96) 0%, rgba(6,12,24,0.94) 100%)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center border-b-2 border-sky-400/35 px-2"
          style={{
            minHeight: 'clamp(2.5rem, 12%, 4rem)',
            background: 'linear-gradient(90deg, rgba(30,174,219,0.12), rgba(125,211,252,0.18), rgba(30,174,219,0.12))',
          }}
        >
          <p
            className="m-0 text-center font-extrabold uppercase text-sky-100"
            style={{
              fontSize: 'clamp(1.1rem, 3.4vw, 2.1rem)',
              letterSpacing: '0.22em',
              lineHeight: 1.1,
              textShadow:
                '0 0 24px rgba(125,211,252,0.65), 0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(255,255,255,0.4)',
            }}
          >
            Pro-Tip
          </p>
        </div>
        <style>{`
          ol :global(li)::marker {
            font-size: clamp(0.95rem, 2.4vw, 1.7rem);
            font-weight: 800;
            color: #7dd3fc;
          }
        `}</style>
        <ol
          className="fs-opening-pro-tip-list m-0 flex flex-1 list-decimal flex-col justify-evenly overflow-hidden px-[clamp(0.75rem,2.5%,1.25rem)] py-[clamp(0.5rem,2%,1rem)]"
          style={{
            paddingLeft: 'clamp(1.75rem, 5%, 2.75rem)',
            gap: 'clamp(0.35rem, 1.5vh, 1rem)',
          }}
        >
          {TIPS.map((tip, i) => (
            <li
              key={i}
              className="font-semibold text-slate-50"
              style={{
                fontSize: 'clamp(0.85rem, 2.15vw, 1.55rem)',
                lineHeight: 1.35,
                textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.5)',
              }}
            >
              {i === 2 ? (
                <>
                  Seek to establish influence around the city by building an{' '}
                  <span
                    className="font-bold"
                    style={{
                      color: '#7dd3fc',
                      textShadow: '0 0 16px rgba(125,211,252,0.55), 0 1px 2px rgba(0,0,0,0.8)',
                    }}
                  >
                    Anchor Tenet
                  </span>{' '}
                  <span style={{ color: 'rgba(186,230,253,0.92)' }}>(light blue cards)</span>
                </>
              ) : (
                tip
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export const OPENING_PRO_TIP_DURATION_MS = 20_000

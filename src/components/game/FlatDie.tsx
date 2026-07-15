'use client'

/** Piped faces for a classic d6 (1–6). */
const PIP_LAYOUT: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
}

type FlatDieProps = {
  face: number | null
  rolling: boolean
  size?: number
}

/**
 * Lightweight CSS die for phones / low-GPU WebViews — no Three.js.
 */
export function FlatDie({ face, rolling, size = 88 }: FlatDieProps) {
  const shown = face != null && face >= 1 && face <= 6 ? face : 1
  const pips = PIP_LAYOUT[shown] ?? PIP_LAYOUT[1]

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        margin: '0 auto',
        borderRadius: Math.max(10, size * 0.14),
        background: 'linear-gradient(145deg, #f8f8f4 0%, #e4e4dc 55%, #d2d2c8 100%)',
        border: '1px solid rgba(0,0,0,0.18)',
        position: 'relative',
        transform: rolling ? 'rotate(18deg) scale(0.94)' : 'none',
        transition: rolling ? 'transform 90ms linear' : 'transform 220ms ease-out',
        animation: rolling ? 'fsFlatDieShake 0.12s linear infinite' : undefined,
      }}
    >
      <style>{`
        @keyframes fsFlatDieShake {
          0% { transform: rotate(-14deg) scale(0.96); }
          50% { transform: rotate(14deg) scale(1.02); }
          100% { transform: rotate(-10deg) scale(0.97); }
        }
      `}</style>
      {pips.map(([x, y], i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${x}%`,
            top: `${y}%`,
            width: size * 0.16,
            height: size * 0.16,
            marginLeft: -size * 0.08,
            marginTop: -size * 0.08,
            borderRadius: '50%',
            background: '#1a1a22',
            opacity: rolling && face == null ? 0.35 : 1,
          }}
        />
      ))}
    </div>
  )
}

'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { CardInstance, PropertyCard, ActionCard } from '@/lib/cardTypes'
import type { FlightRect } from '@/hooks/use-flight-anchors'
import { CardBackFace } from '@/components/game/CardBackFace'
import { HAND_CARD_HEIGHT, HAND_CARD_WIDTH } from '@/components/game/DeckPile'

/**
 * One in-flight card. The source / target rects are *snapshotted* when the flight
 * is queued — we do not re-query positions during the animation, so a hand re-layout
 * mid-flight will not jerk the flying card around.
 *
 * • `kind: 'draw'`    — face-down during flight from the appropriate deck to the matching
 *                       hand section; overlay disappears at the end and the hand un-hides
 *                       the real card.
 * • `kind: 'discard'` — face-up "out of the hand" animation: stays at the source rect and
 *                       slides downward / scales down / fades out. There is no target pile
 *                       (those were removed); the visual conveys "card removed from hand".
 */
export type CardFlight = {
  id: string
  kind: 'draw' | 'discard'
  cardType: 'property' | 'action'
  /** Resolved card metadata for face-up rendering (discards). Optional for face-down draws. */
  card?: PropertyCard | ActionCard | null
  instance?: CardInstance | null
  source: FlightRect
  /** Required for `draw` flights (deck → hand). Ignored for `discard` flights. */
  target?: FlightRect
  /** Optional stagger delay in ms (used when many cards fly in one tick — e.g. the initial deal). */
  delayMs?: number
  /** Solo vs bots: discard animates as a face-down card so AI plays stay hidden. */
  concealedDiscard?: boolean
  /** Per-flight override — mid-game replenish draws fly slower so the new card reads clearly. */
  durationSec?: number
}

interface CardFlightLayerProps {
  flights: CardFlight[]
  /** Called when an individual flight finishes (or its safety-net timeout fires). The instanceId is forwarded
   *  so the parent can flip the matching hand slot back to opacity 1 without having to re-derive it. */
  onFlightDone: (flightId: string, instanceId: string | null) => void
  /** Subtle default. The card-bar feel asks for a quick ease-out without drawing attention to itself. */
  durationSec?: number
}

const DEFAULT_DURATION_SEC = 0.25

/** Bottom-align a card-sized rect inside a measured anchor (slot or fan section). */
function resolveDrawLanding(flight: CardFlight): { x: number; y: number } {
  const target = flight.target ?? flight.source
  const cardSized =
    target.width <= HAND_CARD_WIDTH + 6 && target.height <= HAND_CARD_HEIGHT + 6
  if (cardSized) return { x: target.left, y: target.top }
  return {
    x: target.left + (target.width - HAND_CARD_WIDTH) / 2,
    y: target.top + target.height - HAND_CARD_HEIGHT,
  }
}

function resolveDrawOrigin(flight: CardFlight): { x: number; y: number } {
  const source = flight.source
  return {
    x: source.left + (source.width - HAND_CARD_WIDTH) / 2,
    y: source.top + (source.height - HAND_CARD_HEIGHT) / 2,
  }
}

function variantStyles(variant: 'property' | 'action'): { gradient: string; accent: string; tag: string } {
  if (variant === 'property') {
    return {
      gradient: 'linear-gradient(180deg, #0d2847 0%, #091a30 100%)',
      accent: '#0070cc',
      tag: 'PROPERTY',
    }
  }
  return {
    gradient: 'linear-gradient(180deg, #3d1520 0%, #2a0e16 100%)',
    accent: '#c81b3a',
    tag: 'ACTION',
  }
}

function FlightBack({ variant, w, h }: { variant: 'property' | 'action'; w: number; h: number }) {
  return <CardBackFace variant={variant} width={w} height={h} />
}

function FlightFace({
  variant,
  name,
  w,
  h,
}: {
  variant: 'property' | 'action'
  name: string
  w: number
  h: number
}) {
  const v = variantStyles(variant)
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: Math.max(4, Math.min(12, w / 9)),
        background: v.gradient,
        border: `1px solid ${v.accent}55`,
        overflow: 'hidden',
        boxShadow: '0 10px 24px -10px rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ height: 3, backgroundColor: v.accent }} />
      <div
        style={{
          padding: `${Math.max(4, w / 16)}px ${Math.max(6, w / 12)}px 0`,
          fontSize: Math.max(7, Math.min(10, w / 12)),
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: v.accent,
          opacity: 0.85,
        }}
      >
        {v.tag}
      </div>
      <div style={{ padding: `2px ${Math.max(6, w / 12)}px`, flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontSize: Math.max(9, Math.min(13, w / 9)),
            fontWeight: 500,
            lineHeight: 1.2,
            color: '#ffffff',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {name}
        </p>
      </div>
    </div>
  )
}

function FlyingCard({
  flight,
  durationSec: layerDurationSec,
  onDone,
}: {
  flight: CardFlight
  durationSec: number
  onDone: (flightId: string, instanceId: string | null) => void
}) {
  const durationSec = flight.durationSec ?? layerDurationSec
  /** Safety net: framer-motion's onAnimationComplete is reliable, but if the layer unmounts
   *  for any reason mid-flight, this timeout still releases the hidden hand-card so the user
   *  isn't left with a missing card. */
  useEffect(() => {
    const id = flight.id
    const instanceId = flight.instance?.instanceId ?? null
    const t = window.setTimeout(
      () => onDone(id, instanceId),
      Math.ceil((durationSec + (flight.delayMs ?? 0) / 1000) * 1000) + 200
    )
    return () => window.clearTimeout(t)
  }, [durationSec, flight.delayMs, flight.id, flight.instance, onDone])

  const delaySec = (flight.delayMs ?? 0) / 1000

  if (flight.kind === 'draw') {
    /** Draw: face-down card flies deck → hand at a fixed hand-card size (no scaling). */
    const origin = resolveDrawOrigin(flight)
    const landing = resolveDrawLanding(flight)
    return (
      <motion.div
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: HAND_CARD_WIDTH,
          height: HAND_CARD_HEIGHT,
          pointerEvents: 'none',
          zIndex: 90,
          willChange: 'transform, opacity',
        }}
        initial={{
          x: origin.x,
          y: origin.y,
          opacity: 0,
        }}
        animate={{
          x: landing.x,
          y: landing.y,
          opacity: 1,
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: durationSec,
          delay: delaySec,
          ease: [0.22, 1, 0.36, 1],
          opacity: { duration: 0.12, delay: delaySec },
        }}
        onAnimationComplete={() => onDone(flight.id, flight.instance?.instanceId ?? null)}
      >
        <FlightBack variant={flight.cardType} w={HAND_CARD_WIDTH} h={HAND_CARD_HEIGHT} />
      </motion.div>
    )
  }

  /** Discard: stays at the source rect and animates "out of the hand" — slight downward slide,
   *  scales down, fades out. No target pile to land on (those were removed at the user's request). */
  const useBack = flight.concealedDiscard === true
  return (
    <motion.div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        pointerEvents: 'none',
        zIndex: 90,
        willChange: 'transform, opacity',
        transformOrigin: 'center center',
      }}
      initial={{
        x: flight.source.left,
        y: flight.source.top,
        width: flight.source.width,
        height: flight.source.height,
        opacity: 1,
        scale: 1,
      }}
      animate={{
        x: flight.source.left,
        y: flight.source.top + 28,
        width: flight.source.width,
        height: flight.source.height,
        opacity: 0,
        scale: 0.92,
      }}
      transition={{
        duration: durationSec,
        delay: delaySec,
        ease: 'easeIn',
      }}
      onAnimationComplete={() => onDone(flight.id, flight.instance?.instanceId ?? null)}
    >
      {useBack ? (
        <FlightBack variant={flight.cardType} w={flight.source.width} h={flight.source.height} />
      ) : (
        <FlightFace
          variant={flight.cardType}
          name={flight.card?.name ?? '—'}
          w={flight.source.width}
          h={flight.source.height}
        />
      )}
    </motion.div>
  )
}

/** Renders all queued card flights as fixed-position overlays. */
export function CardFlightLayer({
  flights,
  onFlightDone,
  durationSec = DEFAULT_DURATION_SEC,
}: CardFlightLayerProps) {
  return (
    <AnimatePresence>
      {flights.map((f) => (
        <FlyingCard key={f.id} flight={f} durationSec={durationSec} onDone={onFlightDone} />
      ))}
    </AnimatePresence>
  )
}

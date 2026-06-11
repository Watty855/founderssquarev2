'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, CheckCircle, CaretLeft } from '@phosphor-icons/react'
import { Player, PLAYER_COLORS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface PlayerSetupProps {
  onComplete: (players: Player[]) => void
  /** When set, shows a back control to return to the previous setup step (e.g. game mode). */
  onBack?: () => void
}

export function PlayerSetup({ onComplete, onBack }: PlayerSetupProps) {
  const [numPlayers, setNumPlayers] = useState<number | null>(null)
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [playerNames, setPlayerNames] = useState<string[]>([])

  const handlePlayerCountSelect = (count: number) => {
    setNumPlayers(count)
    setSelectedColors([])
    setPlayerNames(Array(count).fill(''))
  }

  const handleColorSelect = (color: string) => {
    if (selectedColors.includes(color)) {
      setSelectedColors(selectedColors.filter(c => c !== color))
    } else if (numPlayers && selectedColors.length < numPlayers) {
      setSelectedColors([...selectedColors, color])
    }
  }

  const handleNameChange = (index: number, name: string) => {
    const newNames = [...playerNames]
    newNames[index] = name
    setPlayerNames(newNames)
  }

  const handleStartGame = () => {
    if (numPlayers && selectedColors.length === numPlayers) {
      const players: Player[] = selectedColors.map((color, index) => ({
        id: index,
        name: playerNames[index].trim() || `Player ${index + 1}`,
        color,
        actionCards: [],
        propertyCards: [],
        money: 20,
      }))
      const shuffled = [...players].sort(() => Math.random() - 0.5)
      const reordered = shuffled.map((p, i) => ({ ...p, id: i }))
      onComplete(reordered)
    }
  }

  const isColorSelected = (color: string) => selectedColors.includes(color)
  const canStartGame = numPlayers && selectedColors.length === numPlayers

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0a0f',
        zIndex: 9999,
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="btn-ps"
          style={{
            position: 'fixed',
            top: 24,
            left: 24,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 16px',
            borderRadius: 9999,
            border: '1px solid rgba(255,255,255,0.15)',
            backgroundColor: 'rgba(0,0,0,0.45)',
            color: '#f0f0f5',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: 'pointer',
          }}
        >
          <CaretLeft size={18} weight="bold" />
          Back
        </button>
      )}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          width: '100%',
          maxWidth: 540,
          margin: '0 24px',
          backgroundColor: '#141418',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 5px 9px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '48px 48px 0', textAlign: 'center' }}>
          <Users size={32} weight="bold" style={{ color: '#0070cc', marginBottom: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />

          <h1 style={{
            fontSize: 28,
            fontWeight: 300,
            letterSpacing: '0.02em',
            color: '#ffffff',
            margin: 0,
          }}>
            Founders Square
          </h1>

          <p style={{
            fontSize: 14,
            color: '#8888a0',
            marginTop: 12,
            margin: '12px 0 0',
          }}>
            Take your seat at the table and prepare to build your city
          </p>

          <div style={{
            height: 1,
            width: 48,
            backgroundColor: 'rgba(255,255,255,0.1)',
            margin: '32px auto',
          }} />
        </div>

        {/* Content */}
        <div style={{ padding: '0 48px 48px' }}>
          {/* Player count */}
          <div>
            <h3 style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#8888a0',
              marginBottom: 20,
            }}>
              Number of Players
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 16,
            }}>
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  onClick={() => handlePlayerCountSelect(count)}
                  className={numPlayers === count ? '' : 'btn-ps'}
                  style={{
                    height: 48,
                    borderRadius: 9999,
                    border: numPlayers === count ? '2px solid #0070cc' : '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: numPlayers === count ? '#0070cc' : 'transparent',
                    color: numPlayers === count ? '#fff' : 'rgba(255,255,255,0.7)',
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 180ms ease',
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Names + Colors */}
          <AnimatePresence mode="wait">
            {numPlayers && (
              <motion.div
                key={`setup-${numPlayers}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                {/* Player names */}
                <div style={{ marginTop: 40 }}>
                  <h3 style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    color: '#8888a0',
                    marginBottom: 20,
                  }}>
                    Player Names
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 20,
                  }}>
                    {Array.from({ length: numPlayers }, (_, index) => (
                      <div key={index} style={{ marginBottom: 4 }}>
                        <label htmlFor={`player-${index}`} style={{ fontSize: 11, color: '#8888a0', marginBottom: 10, display: 'block' }}>
                          Player {index + 1}
                        </label>
                        <input
                          id={`player-${index}`}
                          placeholder={`Player ${index + 1}`}
                          value={playerNames[index]}
                          onChange={(e) => handleNameChange(index, e.target.value)}
                          style={{
                            width: '100%',
                            height: 48,
                            padding: '0 16px',
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            color: '#ffffff',
                            fontSize: 14,
                            outline: 'none',
                            transition: 'border-color 180ms ease',
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(0,112,204,0.5)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Color selection */}
                <div style={{ marginTop: 40 }}>
                  <h3 style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    color: '#8888a0',
                    marginBottom: 20,
                  }}>
                    Choose Colors
                    <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'none', letterSpacing: 'normal' }}>
                      ({selectedColors.length}/{numPlayers})
                    </span>
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 16,
                  }}>
                    {PLAYER_COLORS.map((colorOption) => {
                      const selected = isColorSelected(colorOption.value)
                      const selectionIndex = selectedColors.indexOf(colorOption.value)

                      return (
                        <button
                          key={colorOption.value}
                          onClick={() => handleColorSelect(colorOption.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: selected ? '1px solid rgba(0,112,204,0.5)' : '1px solid rgba(255,255,255,0.08)',
                            backgroundColor: selected ? 'rgba(255,255,255,0.06)' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 180ms ease',
                          }}
                        >
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                backgroundColor: colorOption.value,
                                border: selected ? '2px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.15)',
                                boxShadow: selected ? `0 0 8px ${colorOption.value.replace(')', ' / 0.4)')}` : 'none',
                              }}
                            />
                            {selected && (
                              <div style={{
                                position: 'absolute',
                                top: -3,
                                right: -3,
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                backgroundColor: '#0070cc',
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                {selectionIndex + 1}
                              </div>
                            )}
                          </div>

                          <span style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: selected ? '#fff' : 'rgba(255,255,255,0.5)',
                          }}>
                            {colorOption.name}
                          </span>

                          {selected && (
                            <CheckCircle size={16} weight="fill" style={{ color: '#0070cc', marginLeft: 'auto', flexShrink: 0 }} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Start button */}
                {canStartGame && (
                  <div style={{ marginTop: 40 }}>
                    <button
                      onClick={handleStartGame}
                      className="btn-ps"
                      style={{
                        width: '100%',
                        height: 56,
                        borderRadius: 9999,
                        backgroundColor: '#0070cc',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 600,
                        border: '2px solid transparent',
                        cursor: 'pointer',
                        boxShadow: '0 5px 9px rgba(0,112,204,0.3)',
                      }}
                    >
                      Start Game
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

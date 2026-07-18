'use client'

import { PlayerScore } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trophy, Medal, ArrowCounterClockwise, Buildings, Path } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

interface GameEndDialogProps {
  open: boolean
  scores: PlayerScore[]
  onNewGame: () => void
}

export function GameEndDialog({ open, scores, onNewGame }: GameEndDialogProps) {
  const sortedScores = [...scores].sort((a, b) => b.totalScore - a.totalScore)
  const winner = sortedScores[0]

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-[min(96vw,68rem)] !max-w-[68rem] max-h-[92vh] overflow-y-auto [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 24,
        }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader style={{ marginBottom: 4 }}>
          <DialogTitle style={{ fontSize: 20, fontWeight: 400, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Trophy size={22} weight="fill" style={{ color: '#1eaedb' }} />
            Game Over
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            style={{ textAlign: 'center' }}
          >
            <div style={{
              padding: 24, borderRadius: 12, position: 'relative', overflow: 'hidden',
              border: `2px solid ${winner.player.color}`, backgroundColor: 'rgba(255,255,255,0.03)',
            }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.08, background: `radial-gradient(circle at 50% 50%, ${winner.player.color}, transparent)` }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                  <Trophy size={28} weight="fill" style={{ color: winner.player.color }} />
                  <span style={{ fontSize: 22, fontWeight: 600, color: winner.player.color }}>
                    {winner.player.name} Wins!
                  </span>
                  <Trophy size={28} weight="fill" style={{ color: winner.player.color }} />
                </div>
                <div style={{ fontSize: 36, fontWeight: 300, color: '#f0f0f5', marginBottom: 16 }}>${winner.totalScore}M</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, fontSize: 13 }}>
                  <div>
                    <div style={{ color: '#8888a0', marginBottom: 2 }}>Cash in Hand</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f5' }}>${winner.cashInHand}M</div>
                  </div>
                  <div>
                    <div style={{ color: '#8888a0', marginBottom: 2 }}>Property Value</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f5' }}>${winner.propertyValue}M</div>
                  </div>
                  <div>
                    <div style={{ color: '#8888a0', marginBottom: 2 }}>End-Game Bonus</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: winner.bonusMillion > 0 ? winner.player.color : '#f0f0f5' }}>
                      ${winner.bonusMillion}M
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#8888a0', marginBottom: 2 }}>Properties</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f5' }}>{winner.propertiesOwned}</div>
                  </div>
                </div>
                {(winner.squareBonuses.length > 0 || winner.streetBonuses.length > 0) ? (
                  <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {winner.squareBonuses.map((b, i) => (
                      <span
                        key={`sq-${i}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 999,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          border: `1px solid ${winner.player.color}66`,
                          fontSize: 11, fontWeight: 600, color: '#f0f0f5',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <Buildings size={12} weight="fill" style={{ color: winner.player.color }} />
                        {b.name} · +${b.bonusMillion}M
                      </span>
                    ))}
                    {winner.streetBonuses.map((b, i) => (
                      <span
                        key={`st-${i}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 999,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          border: `1px solid ${winner.player.color}66`,
                          fontSize: 11, fontWeight: 600, color: '#f0f0f5',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <Path size={12} weight="bold" style={{ color: winner.player.color }} />
                        {b.name} · +${b.bonusMillion}M
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>

          <div>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: '#f0f0f5', marginBottom: 10 }}>Final Standings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedScores.map((score, index) => (
                <motion.div
                  key={score.player.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 * index, duration: 0.3 }}
                >
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '10px 14px', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {index === 0 && <Trophy size={20} weight="fill" style={{ color: '#1eaedb' }} />}
                          {index === 1 && <Medal size={20} weight="fill" style={{ color: '#8888a0' }} />}
                          {index === 2 && <Medal size={20} weight="fill" style={{ color: '#666680' }} />}
                          {index > 2 && <span style={{ fontSize: 13, color: '#666680', fontWeight: 600 }}>{index + 1}</span>}
                        </div>
                        <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: score.player.color }} />
                        <span style={{ fontWeight: 500, color: score.player.color, fontSize: 14 }}>
                          {score.player.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 14, flexShrink: 0 }}>
                        <div style={{ textAlign: 'right', minWidth: 76 }}>
                          <div style={{ color: '#666680', fontSize: 12, whiteSpace: 'nowrap' }}>Cash</div>
                          <div style={{ fontWeight: 600, color: '#f0f0f5', whiteSpace: 'nowrap' }}>${score.cashInHand}M</div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 90 }}>
                          <div style={{ color: '#666680', fontSize: 12, whiteSpace: 'nowrap' }}>Properties</div>
                          <div style={{ fontWeight: 600, color: '#f0f0f5', whiteSpace: 'nowrap' }}>${score.propertyValue}M</div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 76 }}>
                          <div style={{ color: '#666680', fontSize: 12, whiteSpace: 'nowrap' }}>Bonus</div>
                          <div style={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            color: score.bonusMillion > 0 ? score.player.color : '#f0f0f5',
                          }}>
                            ${score.bonusMillion}M
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 90 }}>
                          <div style={{ color: '#666680', fontSize: 12, whiteSpace: 'nowrap' }}>Total</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f5', whiteSpace: 'nowrap' }}>${score.totalScore}M</div>
                        </div>
                      </div>
                    </div>
                    {(score.squareBonuses.length > 0 || score.streetBonuses.length > 0) ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 48 }}>
                        {score.squareBonuses.map((b, i) => (
                          <span
                            key={`sq-${i}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px', borderRadius: 999,
                              backgroundColor: 'rgba(255,255,255,0.04)',
                              border: `1px solid ${score.player.color}55`,
                              fontSize: 10.5, fontWeight: 600, color: '#dcdce6',
                              letterSpacing: '0.03em',
                            }}
                          >
                            <Buildings size={10} weight="fill" style={{ color: score.player.color }} />
                            {b.name} · +${b.bonusMillion}M
                          </span>
                        ))}
                        {score.streetBonuses.map((b, i) => (
                          <span
                            key={`st-${i}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px', borderRadius: 999,
                              backgroundColor: 'rgba(255,255,255,0.04)',
                              border: `1px solid ${score.player.color}55`,
                              fontSize: 10.5, fontWeight: 600, color: '#dcdce6',
                              letterSpacing: '0.03em',
                            }}
                          >
                            <Path size={10} weight="bold" style={{ color: score.player.color }} />
                            {b.name} · +${b.bonusMillion}M
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
            <button
              onClick={onNewGame}
              className="btn-ps"
              style={{
                height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
                fontSize: 14, fontWeight: 600, border: '2px solid transparent', cursor: 'pointer',
                padding: '0 28px', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <ArrowCounterClockwise size={18} weight="bold" />
              New Game
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

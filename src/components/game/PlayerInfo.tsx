'use client'

import { Player, Plot } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { MapPin, CurrencyDollar } from '@phosphor-icons/react'

interface PlayerInfoProps {
  players: Player[]
  currentPlayerIndex: number
  plots: Plot[]
}

export function PlayerInfo({ players, currentPlayerIndex, plots }: PlayerInfoProps) {
  const getPlayerPlotCount = (playerId: number): number => {
    return plots.filter(p => p.claimedBy === playerId).length
  }

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {players.map((player, index) => {
        const plotCount = getPlayerPlotCount(player.id)
        const isCurrent = index === currentPlayerIndex

        return (
          <Card
            key={player.id}
            className="px-4 py-3 flex items-center gap-3 min-w-[180px] transition-all duration-200"
            style={{
              borderColor: isCurrent ? player.color : 'transparent',
              borderWidth: isCurrent ? '3px' : '1px',
              boxShadow: isCurrent ? `0 0 20px ${player.color}40` : 'none',
            }}
          >
            <div
              className="w-10 h-10 rounded-lg border-2 border-card-foreground/20 flex items-center justify-center"
              style={{ backgroundColor: player.color }}
            >
              <MapPin size={24} weight="fill" className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-card-foreground">{player.name}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CurrencyDollar size={14} weight="bold" className="text-accent" />
                  ${player.money}M
                </span>
                <span>{plotCount} plots</span>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

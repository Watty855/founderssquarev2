import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GameApp from '@/components/game/GameApp'
import { startFreezeWatchdog } from '@/lib/freezeWatchdog'
import './globals.css'

startFreezeWatchdog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="h-screen w-screen">
      <GameApp />
    </div>
  </StrictMode>
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GameApp from '@/components/game/GameApp'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="h-screen w-screen">
      <GameApp />
    </div>
  </StrictMode>
)

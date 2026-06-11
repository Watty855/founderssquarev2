declare module '@3d-dice/dice-box-threejs' {
  interface DiceBoxConfig {
    assetPath?: string
    framerate?: number
    sounds?: boolean
    volume?: number
    color_spotlight?: number
    shadows?: boolean
    theme_surface?: string
    sound_dieMaterial?: string
    theme_customColorset?: Record<string, unknown> | null
    theme_colorset?: string
    theme_texture?: string
    theme_material?: string
    gravity_multiplier?: number
    light_intensity?: number
    baseScale?: number
    strength?: number
    iterationLimit?: number
    onRollComplete?: (results: DiceBoxResult) => void
    onRerollComplete?: (results: DiceRollEntry[]) => void
    onAddDiceComplete?: (results: DiceRollEntry[]) => void
    onRemoveDiceComplete?: (results: DiceRollEntry[]) => void
  }

  interface DiceRollEntry {
    type: string
    sides: number
    id: number
    value: number
    reason?: string
  }

  interface DiceBoxResultSet {
    num: number
    type: string
    sides: number
    rolls: DiceRollEntry[]
    total: number
  }

  interface DiceBoxResult {
    notation: string
    sets: DiceBoxResultSet[]
    modifier: number
    total: number
  }

  class DiceBox {
    sounds: boolean
    constructor(selector: string, config?: DiceBoxConfig)
    initialize(): Promise<void>
    roll(notation: string): Promise<DiceBoxResult>
    reroll(rollIds: number[]): Promise<DiceRollEntry[]>
    add(notation: string): Promise<DiceRollEntry[] | DiceBoxResult>
    remove(rollIds: number[]): Promise<DiceRollEntry[]>
    clearDice(): void
    getDiceResults(index?: number): DiceBoxResult | DiceRollEntry
    updateConfig(config: Partial<DiceBoxConfig>): Promise<void>
    enableShadows(): void
    disableShadows(): void
  }

  export default DiceBox
}

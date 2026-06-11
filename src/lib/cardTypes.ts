export interface PropertyCard {
  id: string
  type: 'property' | 'anchor'
  name: string
  /** Shown under the title on anchor tenet cards (compact + full views). */
  subtitle?: string
  buildCost: number
  buildIncome: number
  influence: number
  bankValue: number
  endGameValue: number
  copies: number
  buildLocations: string[]
  specialAbility?: string
  category: 'civic' | 'commercial' | 'residential' | 'industrial' | 'service' | 'anchor'
  district?: 'Riverfront' | 'Mountain Cove' | 'Railway District' | 'Farmland' | 'City Center'
}

export interface ActionCard {
  id: string
  type: 'action'
  category: 'legal' | 'financial' | 'social' | 'regulatory'
  name: string
  description: string
  buildCost: number | string
  buildIncome: number | string
  bankValue: number
  /** Optional: book value on properties at endgame for cards that create a lasting stake (e.g. Investment). */
  endGameValue?: number
  copies: number
  placementRule?: string
  actions: string
  diceRequired: boolean
  diceRollRule?: string
}

export interface CardInstance {
  cardId: string
  instanceId: string
  cardNumber: number
}

export type Card = PropertyCard | ActionCard

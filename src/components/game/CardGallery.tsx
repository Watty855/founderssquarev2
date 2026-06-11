'use client'

import { useState } from 'react'
import { propertyCards, actionCards } from '@/lib/cardData'
import { PropertyCardView } from './PropertyCardView'
import { ActionCardView } from './ActionCardView'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { PropertyCard, ActionCard } from '@/lib/cardTypes'

export function CardGallery() {
  const [selectedCard, setSelectedCard] = useState<PropertyCard | ActionCard | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleCardClick = (card: PropertyCard | ActionCard) => {
    setSelectedCard(card)
    setIsDialogOpen(true)
  }

  const categories = ['all', 'civic', 'commercial', 'residential', 'industrial', 'service', 'anchor'] as const

  const filterByCategory = (category: typeof categories[number]) => {
    if (category === 'all') return propertyCards
    return propertyCards.filter(card => card.category === category)
  }

  return (
    <div className="w-full">
      <Tabs defaultValue="property" className="w-full">
        <TabsList className="w-full justify-start mb-6">
          <TabsTrigger value="property" className="text-base px-6">Property Cards</TabsTrigger>
          <TabsTrigger value="action" className="text-base px-6">Action Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="property">
          <Tabs defaultValue="all" className="w-full">
            <ScrollArea className="w-full whitespace-nowrap">
              <TabsList className="inline-flex w-auto">
                {categories.map(cat => (
                  <TabsTrigger 
                    key={cat} 
                    value={cat}
                    className="capitalize"
                  >
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollArea>

            {categories.map(cat => (
              <TabsContent key={cat} value={cat}>
                <ScrollArea className="h-[calc(100vh-250px)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4">
                    {filterByCategory(cat).map((card, index) => (
                      <div key={`${card.id}-${index}`}>
                        <PropertyCardView 
                          card={card} 
                          onClick={() => handleCardClick(card)}
                        />
                        <div className="text-center mt-2 text-sm text-muted-foreground">
                          Copies: {card.copies}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="action">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4">
              <div>
                <ActionCardView showBack />
                <div className="text-center mt-2 text-sm text-muted-foreground">
                  Card Back
                </div>
              </div>
              {actionCards.map((card, index) => (
                <div key={`${card.id}-${index}`}>
                  <ActionCardView 
                    card={card} 
                    onClick={() => handleCardClick(card)}
                  />
                  <div className="text-center mt-2 text-sm text-muted-foreground">
                    Copies: {card.copies}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-fit bg-transparent border-none shadow-none">
          {selectedCard && (
            <>
              {selectedCard.type === 'property' ? (
                <PropertyCardView card={selectedCard as PropertyCard} className="scale-110" />
              ) : (
                <ActionCardView card={selectedCard as ActionCard} className="scale-110" />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

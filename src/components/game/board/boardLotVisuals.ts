import type { PropertyCard } from '@/lib/cardTypes'

/** Blueprint theme — standard blueprint blue for lots, black for streets. */
export const BLUEPRINT_LOT_BG = '#c5daf0'
export const BLUEPRINT_LOT_BORDER = '#7aa8c8'
export const BLUEPRINT_LOT_TEXT = '#0a0a0a'
export const STREET_BLACK = '#08080e'
export const LOT_LABEL_FONT = "'Cinzel', 'Space Grotesk', serif"
export const LABEL_FONT = "'Space Grotesk', system-ui, sans-serif"
export const CHURCH_BLOCK_FILL = 'linear-gradient(135deg, #1f5c34 0%, #0d3018 100%)'

function estimateWrappedLines(text: string, charsPerLine: number): number {
  if (!text || charsPerLine < 1) return 1
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  let lines = 1
  let used = 0
  for (const word of words) {
    const need = word.length
    if (used === 0) {
      used = need
      if (need > charsPerLine) {
        lines += Math.ceil(need / charsPerLine) - 1
        used = need % charsPerLine
      }
      continue
    }
    if (used + 1 + need <= charsPerLine) {
      used += 1 + need
    } else {
      lines += 1
      used = need
      if (need > charsPerLine) {
        lines += Math.ceil(need / charsPerLine) - 1
        used = need % charsPerLine
      }
    }
  }
  return Math.max(1, lines)
}

function computeLotLabelSizes(
  cityCell: number,
  title: string,
  hasLetter: boolean,
  compact: boolean
): { letterPx: number; titlePx: number } {
  const pad = 2
  const usableW = Math.max(8, cityCell - pad)
  const usableH = Math.max(8, cityCell - pad)
  const letterMax = compact ? 8 : 10
  const titleMax = compact ? 8 : 9
  const titleMin = 3.25
  const lineHeight = 1.05
  const charWidthFactor = 0.58

  let bestLetter = hasLetter ? Math.min(letterMax, usableH * 0.28) : 0
  let bestTitle = titleMin

  for (let titlePx = titleMax; titlePx >= titleMin; titlePx -= 0.25) {
    const letterPx = hasLetter
      ? Math.min(letterMax, Math.max(3.5, Math.min(titlePx * 1.15, usableH * 0.26)))
      : 0
    const gap = hasLetter ? 1 : 0
    const titleBudgetH = usableH - letterPx - gap
    const charsPerLine = Math.max(1, Math.floor(usableW / (titlePx * charWidthFactor)))
    const lines = estimateWrappedLines(title, charsPerLine)
    const titleH = lines * titlePx * lineHeight
    if (titleH <= titleBudgetH + 0.5) {
      bestLetter = letterPx
      bestTitle = titlePx
      break
    }
  }

  return { letterPx: bestLetter, titlePx: bestTitle }
}

const labelSizeCache = new Map<string, { letterPx: number; titlePx: number }>()

/** Cached label fit — keyed by cell-size bucket + title + letter flag + compact. */
export function cachedLotLabelSizes(
  cityCellPx: number,
  title: string,
  hasLetter: boolean,
  compact: boolean
): { letterPx: number; titlePx: number } {
  const bucket = Math.round(cityCellPx * 2) / 2
  const key = `${bucket}|${compact ? 1 : 0}|${hasLetter ? 1 : 0}|${title}`
  let hit = labelSizeCache.get(key)
  if (!hit) {
    hit = computeLotLabelSizes(cityCellPx, title, hasLetter, compact)
    labelSizeCache.set(key, hit)
  }
  return hit
}

/** Bleed-band / small-caps label size from the city cell size. */
export function bleedLabelPx(cityCell: number, compact: boolean): number {
  return Math.max(4, Math.min(compact ? 7 : 8, cityCell * 0.28))
}

export function anchorTooltip(card: PropertyCard): string | undefined {
  switch (card.id) {
    case 'church':
      return `INFLUENCE: +1 (entire board; max +1)\nINCOME: +1 (block)\nChurch affiliation created!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and any already-built anchor tenets`
    case 'farm-coop':
      return `INFLUENCE: +1 (Farmland)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Farmland targets (evaluated on target block)\nFarm Bureau formed!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to farmland except Union and already-built anchor tenets`
    case 'port-authority':
      return `INFLUENCE: +1 (Railway district)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Railway district targets (evaluated on target block)\nPort Authority engineered!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the railway district except Union and already-built anchor tenets`
    case 'arts-council':
      return `INFLUENCE: +1 (River Front)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on River Front targets (evaluated on target block)\nArts Council crafted!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the riverfront district except Union and already-built anchor tenets`
    case 'tourism-office':
      return `INFLUENCE: +1 (Mountain Cove)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Mountain Cove targets (evaluated on target block)\nTourism office conceived!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the mountain cove district except Union and already-built anchor tenets`
    case 'media':
      return `INFLUENCE: +1 (Scandals only; max +1 with News Outlet)\nINCOME: +1 (block)\nSocial media influencer launched!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'news-outlet':
      return `INFLUENCE: +1 (Scandals only; max +1 with Influencer)\nINCOME: +1 (block)\nNews Outlet originated!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'mafia':
      return `INFLUENCE: +1 (takeover, same city block)\nINCOME: +1 (block)\nEXTORTION: Opponents pay $1M per covered non-anchor business lot to each Mafia owner in the block when they roll property income.\nMafia infiltrated!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'regulation-bureau':
      return `INFLUENCE: +1 (block) / −1 for rivals (takeover only)\nINCOME: +1 (block)\nTAKEOVER: Other players' lots in this block have −1 takeover influence vs Hostile Takeover (+1 attacker roll per distinct non-defender bureau in block).\nRegulation Bureau established!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'union':
      return `INFLUENCE: +1 in the district where this Union was played (stacks with other Unions)\nINCOME: +$M on your other lots on this city block; rivals’ lots on this block −$M on their Income (lost, not paid to you)\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any vacant Anchor Tenet lot`
    default:
      return undefined
  }
}

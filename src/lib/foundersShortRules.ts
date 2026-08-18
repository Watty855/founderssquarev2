/**
 * Ultra-short rules for the in-game book-icon sheet (mirrors public/assets/quick-rules-sheet.png).
 * Cards and board highlights carry detail; this is a reminder only.
 */
export const FOUNDERS_SHORT_RULES: ReadonlyArray<{
  title: string
  lines: readonly string[]
}> = [
  {
    title: 'Goal',
    lines: [
      'Build properties, play action cards, and collect income. Win by timing the Final Round and out-scoring rivals.',
    ],
  },
  {
    title: 'Your turn',
    lines: [
      '3 actions per turn: 1 build + 2 others, or 0 builds + 3 actions.',
      'A successful Rezoning counts as 2 actions (build included); a failed one costs 1.',
      'Only one Income action per turn.',
      'Hand may exceed 8 mid-turn — discard down to 8 only after your 3 actions are used.',
    ],
  },
  {
    title: 'Anchor Tenets',
    lines: [
      'Center lot of every block. Reach is citywide (G) or block-only (B) per its printed rules; multiple built copies stack.',
      '+$1M to your other properties in its block during Income; Regulation Bureau/Union also −$1M to rivals there; Mafia takes $1M from rival businesses there.',
      '+1 influence for owning 5+ properties in a block, or targeting the lot across from your 6 sequential street lots.',
      'Scandal or a successful Police Raid overthrows an Anchor Tenet — the lot vacates and can be reclaimed.',
    ],
  },
  {
    title: 'Against opponents',
    lines: [
      'Hostile Takeover, Rezoning, and Remove Investors are modified by the relevant Anchor Tenets.',
      'City Hall, Courthouse, or Police: +1 max on Freeze and Police Raid rolls.',
      'Influencer and/or News Outlet: +1 max on Scandal rolls.',
    ],
  },
  {
    title: 'Calamity',
    lines: [
      'Plays itself the instant it’s drawn — at most once every 6 rounds.',
      'Every founder rolls in turn order starting with the drawer: lose 5–30% of cash (5% per pip). Cannot be overturned.',
    ],
  },
  {
    title: 'Bonuses',
    lines: [
      '$50M + naming rights for a fully-owned 3×3 city block.',
      '$30M + naming rights for a 6-lot straight run (3+3) along a street.',
    ],
  },
  {
    title: 'End game',
    lines: [
      '9 built properties in a row/column, or a full 3×3 block, triggers the Final Round.',
      'Every player gets one more turn, then final scoring (Squares & Streets) decides the winner.',
    ],
  },
]

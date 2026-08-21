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
      'Your hand holds 5 property cards and 5 action cards at all times. Play begins with drawing 2 additional action cards; play ends by drawing back up to 5 property cards.',
      '3 actions per turn: 1 build + 2 others, or 0 builds + 3 actions.',
      'A successful Rezoning counts as 2 actions (build included); a failed one costs 1.',
      'Only one Income action per turn.',
      'Hand may not exceed 8 at the conclusion of your turn — it may exceed 8 mid-turn.',
    ],
  },
  {
    title: 'Anchor Tenets',
    lines: [
      'Center lot of every block. Reach is citywide (G) or block-only (B) per its printed rules; multiple built copies stack.',
      'Anchor Tenets add additional monetary value and influence to their block and city, based on the various property values.',
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
      'Plays itself the instant it’s drawn — at most once every 7 rounds.',
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
      '12 adjacent properties owned by the same player makes the Final Round available — only that player may declare it, on their own turn.',
      'Declaring starts it immediately: every other founder gets one more turn, and the declaring player also gets one more turn, then final scoring (Squares & Streets).',
      'The eligible player has up to 4 of their own turns to declare. If they haven’t declared by the end of their 4th turn, the game ends immediately at that point — no bonus round for anyone else.',
    ],
  },
]

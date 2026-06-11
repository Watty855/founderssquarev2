/**
 * Ultra-short rules for in-game “quick rules” sheet. Card play UIs and board highlights
 * carry detail; this is a reminder only — edit here to tune brevity.
 */
export const FOUNDERS_SHORT_RULES: ReadonlyArray<{
  title: string
  lines: readonly string[]
}> = [
  {
    title: 'Goal',
    lines: [
      'Build on lots, play actions, collect income. Win by timing the end game and scoring.',
    ],
  },
  {
    title: 'Lots & districts',
    lines: [
      'Every property card names its district; each lot shows its district under the building name.',
      'The central lot on each block is called the "anchor tenet." Each anchor philosophy allows different influence modifiers that affect income and strategic actions.',
      'Passive anchor influence toward dice rolls is usually capped at ±1 per step unless a card counts distinct sources (for example Regulation Bureau owners in a block).',
      'Union anchors: Church-style +$M on your other lots on that Union block; −$M per rival lot on that block on their Income only (lost cash, not transferred).',
      'Action-card scopes: Hostile Takeover anchor modifiers use only the target lot’s city block. Rezoning civic influence is board-wide (any civic you own; max +1). City Council Freeze uses City Hall/Courthouse anywhere (max +1). Remove Investors uses anchors/civics only on the selected lot’s block. Police Raid: +1 raid influence from Police/City Hall/Courthouse anywhere (max +1). Scandal: +1 max from Influencer and/or News Outlet together.',
      'Valid build targets highlight when you start placement. Crossing the Line (action) can bypass district lock for one build.',
    ],
  },
  {
    title: 'Actions & property cards',
    lines: [
      'When you play an action, follow the on-screen copy and prompts — that text is the rule for that play.',
      'Click a property card to place it (valid lots pulse), then click a highlighted lot. You cannot claim a vacant lot with a bare board click alone.',
    ],
  },
  {
    title: 'Turn & income',
    lines: [
      'You have a maximum of 3 actions per turn (see turn counter in play). Bank or play cards as allowed.',
      'Only one Income action can be played per turn. Resolve Income when you play the Income action and roll — percentages apply to your property income for that resolution.',
    ],
  },
  {
    title: 'Strategy',
    lines: [
      'Strategically build properties to control the board and gain influence with anchor philosophies. Use action cards to disrupt or defend against other founders. Bank income to save for future builds. Aim for the final round by building 9 or more built-property streaks and receive bonuses.',
    ],
  },
  {
    title: 'Bonuses',
    lines: [
      '$30M + naming bonus for every fully-owned 3×3 city block, allowing the square to be named in your honor.',
      '$30M + naming bonus for every 6-lot 3+3 run along a street; allowing the street to be named in your honor',
    ],
  },
  {
    title: 'End game',
    lines: [
      'A successful build of 9 or more built-property streaks triggers a Final Round; then final scoring names districts like Squares and Streets.',
    ],
  },
]

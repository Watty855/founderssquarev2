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
      'Anchor influence follows its printed reach: G is citywide, B is one city block, and named districts apply only when the selected lot lies there. Applicable Anchor identities stack; duplicate copies of one identity do not.',
      'Every active Anchor adds +$1M to each of your other properties in its block during Income. Regulation Bureau and Union also subtract $1M from each rival property in that block; Mafia additionally collects $1M from each rival business there.',
      'Action scopes: Anchor Tenets modify Hostile Takeover, Rezoning, and Remove Investors as printed. City Hall, Courthouse, or Police gives +1 max on City Council Freeze and Police Raid. Influencer and/or News Outlet gives +1 max on Scandal.',
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

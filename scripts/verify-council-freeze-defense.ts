/** Engine-level verification of the online council-freeze defense handoff. Run:
 *    npx vite-node scripts/verify-council-freeze-defense.ts
 */
import { applyGameAction } from '@/lib/gameEngine/applyGameAction'
import { createInitialBoard } from '@/lib/boardData'
import type { GameState, Player } from '@/lib/types'

function mkPlayer(id: number, name: string, opts?: { isAi?: boolean; conn?: string }): Player {
  return {
    id,
    name,
    money: 50,
    color: '#fff',
    actionCards: [],
    propertyCards: [],
    isAi: opts?.isAi,
    partySeatConnectionId: opts?.conn,
  } as unknown as Player
}

const base: GameState = {
  players: [
    mkPlayer(1, 'Host Human', { conn: 'conn-host' }),
    mkPlayer(2, 'Liam', { conn: 'conn-liam' }),
    mkPlayer(3, 'Founderbot Two', { isAi: true }),
  ],
  plots: createInitialBoard(),
  currentPlayerIndex: 1,
  isSetupComplete: true,
  actionDeck: [],
  propertyDeck: [],
  actionDiscard: [],
  propertyDiscard: [],
  propertiesBuiltThisTurn: 0,
  actionsPlayedThisTurn: 0,
  turnActionsConsumed: 1,
  incomeResolvedThisTurn: false,
  crossingTheLineActive: false,
  pendingIncomeTaxPlayerIds: [],
  openingNarrationComplete: true,
  playRoundNumber: 1,
}

let pass = 0
let fail = 0
function check(label: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  PASS ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}`)
  }
}

// ── Scenario A: human defender (Host Human targeted by Liam) ──
const pendingOnHuman: GameState = {
  ...base,
  pendingCouncilFreezeDefense: {
    targetPlayerId: 1,
    attackerPlayerId: 2,
    attackerName: 'Liam',
    targetName: 'Host Human',
  },
}

console.log('A) Human defender')
const wrongSender = applyGameAction(pendingOnHuman, { type: 'council_freeze_defense', result: 6 }, { senderConnectionId: 'conn-liam' })
check('attacker cannot roll for the defender', !wrongSender.ok)

const negate = applyGameAction(pendingOnHuman, { type: 'council_freeze_defense', result: 6 }, { senderConnectionId: 'conn-host' })
check('defender roll of 6 accepted', negate.ok)
if (negate.ok) {
  check('freeze negated (no build block)', negate.state.councilFreezeBlockBuildForPlayerId === undefined)
  check('pending cleared', negate.state.pendingCouncilFreezeDefense === undefined)
  check('result event emitted (negated)', negate.events.some((e) => e.type === 'council_freeze_result' && e.negated))
}

const holds = applyGameAction(pendingOnHuman, { type: 'council_freeze_defense', result: 3 }, { senderConnectionId: 'conn-host' })
check('defender roll of 3 accepted', holds.ok)
if (holds.ok) {
  check('freeze applies to target', holds.state.councilFreezeBlockBuildForPlayerId === 1)
  check('result event emitted (holds)', holds.events.some((e) => e.type === 'council_freeze_result' && !e.negated))
}

// ── Scenario B: bot defender (Founderbot Two targeted) ──
const pendingOnBot: GameState = {
  ...base,
  pendingCouncilFreezeDefense: {
    targetPlayerId: 3,
    attackerPlayerId: 2,
    attackerName: 'Liam',
    targetName: 'Founderbot Two',
  },
}

console.log('B) Bot defender')
const guestForBot = applyGameAction(pendingOnBot, { type: 'council_freeze_defense', result: 2 }, { senderConnectionId: 'conn-liam' })
check('guest cannot roll for a bot', !guestForBot.ok)

const hostForBot = applyGameAction(pendingOnBot, { type: 'council_freeze_defense', result: 2 }, { senderConnectionId: 'conn-host', senderIsHost: true })
check('host rolls for the bot', hostForBot.ok)
if (hostForBot.ok) {
  check('freeze applies to bot', hostForBot.state.councilFreezeBlockBuildForPlayerId === 3)
}

// ── Scenario C: no pending defense ──
console.log('C) Guards')
const noPending = applyGameAction(base, { type: 'council_freeze_defense', result: 6 }, { senderConnectionId: 'conn-host' })
check('rejected when nothing is pending', !noPending.ok)
const badRoll = applyGameAction(pendingOnHuman, { type: 'council_freeze_defense', result: 9 }, { senderConnectionId: 'conn-host' })
check('rejected on out-of-range roll', !badRoll.ok)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)

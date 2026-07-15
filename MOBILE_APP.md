# Founders Square — Mobile App & Live Multiplayer

This branch (`mobile-app`) turns Founders Square v2 into a production-ready mobile
app with **live online multiplayer**: every player at the table sees the board
update in real time as moves are played.

## Architecture

```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│  HOST device                │        │  GUEST devices              │
│  React game + rules engine  │        │  React game (same bundle)   │
│  + onlineRoomAuthority      │◄──────►│  optimistic apply/rollback  │
└──────────────┬──────────────┘        └──────────────┬──────────────┘
               │      Supabase Realtime channels      │
               └──────────────────┬───────────────────┘
                                  ▼
                    fs-lobby-{room}  (presence roster + seat plan)
                    fs-board-{room}  (game actions + state broadcasts)
```

- **One codebase, three targets.** The Vite web bundle runs in the browser and is
  wrapped by **Capacitor** into native iOS and Android shells. No rewrite, no
  platform forks — every gameplay change ships to all targets.
- **No game server to operate.** The old PartyKit/Colyseus servers are gone. The
  **host device runs the rules authority** (`src/lib/onlineRoomAuthority.ts`):
  guests send typed `game_action`s over a Supabase Realtime broadcast channel,
  the host validates them with the shared engine (`applyGameAction`), bumps a
  revision, and broadcasts the redacted `public_state` plus per-seat
  `private_hand`s. Guests apply moves optimistically and roll back if rejected.
- **Live for everyone.** All seats (and any device that joins with the room
  code) receive every authoritative state broadcast — spectating a table is
  just joining its board channel.

### Key modules

| File | Role |
| --- | --- |
| `src/lib/realtimeClient.ts` | Supabase client, device identity, room codes/topics |
| `src/lib/onlineRoomAuthority.ts` | Transport-agnostic rules authority (runs on host) |
| `src/lib/useOnlineBoardSync.ts` | Live board sync hook (actions, snapshots, rollback) |
| `src/lib/usePartySeatPlanRoom.ts` | Lobby roster (presence) + seat-plan sync |
| `src/components/game/MultiplayerLobby.tsx` | Create/enter a room, see who's there |
| `src/components/game/JoinOnlineGame.tsx` | Guest hydration from the host authority |

## Setup (one time, ~5 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
   **No database tables are needed** — only Realtime broadcast/presence.
2. Project Settings → API → copy the URL and `anon` key.
3. `cp .env.example .env` and fill in:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

4. `npm install && npm run dev` — the Online mode card now works.

Without the env vars the app still builds and runs; online screens show setup
instructions while single player and pass-and-play remain fully playable.

## Playing online

1. **Guest (any device / app):** Title → **Join friend's game** → room code → **Join and wait**.
   You enter automatically when the host clicks **Start game** — no post-start join step.
2. **Host:** Title → **Play online** → room code → **Host this table** → use **Party roster**
   seats → **Start game**.
3. Everyone must be in the room **before** Start so the host can seat them from the roster.

Native apps (iPhone, iPad, Android, Mac via Catalyst) use the same flow — see
[APP_DISTRIBUTION.md](./APP_DISTRIBUTION.md).

## Mobile production pipeline

```bash
npm run build          # web bundle (env baked in at build time)
npx cap sync           # copy bundle + plugins into ios/ and android/
npx cap open ios       # Xcode  → Archive → TestFlight / App Store
npx cap open android   # Android Studio → AAB → Play Console
```

- First time only: `npx cap add ios` / `npx cap add android` to generate the
  native projects (they are committed afterwards).
- iOS requires an Apple Developer account ($99/yr); Android a Play Console
  account ($25 once).
- Live updates of web assets without store review can be added later with
  Capgo or Ionic Appflow.

## Notes & future hardening

- **Trust model**: state is relayed peer-to-peer through Supabase broadcast, so
  hand privacy is enforced by the clients (fine for friendly play). For ranked
  or public matchmaking, move `onlineRoomAuthority` into a Supabase Edge
  Function or small worker — it is already transport-agnostic, so only the
  delivery glue changes.
- **Host disconnects** pause action processing until the host returns (their
  authority store is rebuilt from their local state). A future iteration can
  persist snapshots to Supabase Postgres for host migration — see
  [docs/REMOTE_AUTHORITY.md](./docs/REMOTE_AUTHORITY.md) for the Edge Function
  migration path (scaffold under `supabase/functions/fs-board-authority/`).
- Lobby chat / voice from v1 was intentionally left out of this pass and can be
  layered onto the same lobby channel.

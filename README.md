# Founders Square v2

A strategic city-building tabletop game — rebuilt as a mobile-ready app.

v2 ports the complete rules engine and board from `founders-square-glow` onto a
**Vite + React + TypeScript** web core wrapped with **Capacitor** for native
iOS and Android builds. PartyKit and Colyseus have been removed entirely;
live online play now runs on **Supabase Realtime** with the host device as the
rules authority — see [MOBILE_APP.md](./MOBILE_APP.md).

## Game modes

- **Single player** — play against AI founders (bots).
- **Pass & play multiplayer** — turn-based multiplayer around one device, ideal for mobile.
- **Online (live)** — room-code lobbies over Supabase Realtime: everyone sees the
  board update live as moves are played, on web and in the mobile apps. Setup
  takes ~5 minutes — see [MOBILE_APP.md](./MOBILE_APP.md).

## What's new in v2

- **Mobile shell** — Capacitor config (`capacitor.config.ts`) with splash screen,
  status bar, and haptics plugins ready; safe-area viewport in `index.html`.
- **Sound design** (all Web Audio, no assets — works offline):
  - Construction (hammer, drill, bandsaw) when a structure is built
  - Cash register when income is earned
  - Crowd boo when Taxation is played
  - Crowd cheer on a winning die roll
  - Anchor chain drop (with a board notice naming the anchor) when an anchor tenet is placed
- **Build elevation animation** — newly built structures rise off the board with a
  shadow cast from the Mountain–Railway apex toward the River–Farmland apex.
- **Prominent masthead** — gilded "Founders Square" title above the board.
- **Quieter notifications** — routine per-turn guidance toasts are suppressed;
  broadcast events (taxation, builds, anchors) surface as board notices with sound.
- **Card consolidation**:
  - Arts & Entertainment (was Museum + Tourism/Fairgrounds): $6M build / $2M income / $3M end-game
  - Food & Grocery (was Grocery + Dining/Food): $4M build / $2M income / $3M end-game
  - Industry & Mining (was Industry + Mining): $8M build / $6M income / $6M end-game
- **Face-card corner letters** on property cards (top-left and top-right):
  C civic · A arts/museum/tourism/fairgrounds · T hotel · P park · Co commercial ·
  H housing · I industry/mining · D freight/distribution · S storage/warehouse ·
  F food/grocery · O fuel/power.

## Development

```bash
npm install
npm run dev        # web dev server at http://localhost:5173
npm run build      # production web bundle in dist/
```

## Mobile builds (Capacitor)

```bash
npx cap add ios        # once, generates the ios/ project (requires Xcode)
npx cap add android    # once, generates the android/ project (requires Android Studio)
npm run cap:ios        # build web bundle, sync, open Xcode
npm run cap:android    # build web bundle, sync, open Android Studio
```

## Project layout

- `src/lib/` — rules engine: cards, board, placement, game engine, bots
- `src/components/game/` — board, hand, dialogs, setup wizard
- `src/lib/soundEffects.ts` — synthesized sound design
- `src/lib/useOnlineBoardSync.ts` — live board sync over Supabase Realtime
- `src/lib/onlineRoomAuthority.ts` — host-side rules authority for online play

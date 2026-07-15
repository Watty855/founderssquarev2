# Remote authority (Edge Function / worker) — migration path

Today the **host device** runs `onlineRoomAuthority` inside WKWebView. That is viable for
friendly tables but concentrates CPU, battery, and single-point-of-failure risk on one phone.

## Target architecture

```
Guest / Host clients          Supabase Realtime                 Authority
─────────────────            ──────────────────                ─────────
game_action ───────────────► fs-board-{room}  ───────────────► Edge Function
                                                                  │ applyGameAction
                                                                  │ bump rev
public_state / hands / fx ◄── broadcast ◄─────────────────────────┘
```

- Clients stop calling local `authorityApplyGameAction` when `VITE_REMOTE_AUTHORITY=1`.
- One Deno Edge Function (or Cloudflare Worker) holds the in-memory or Redis-backed store
  keyed by room code (same shape as `OnlineAuthorityStore`).
- Host still “owns” the lobby (seat plan); authority ownership transfers to the function
  after `game_init`.

## Why not shipped in this change set

Moving the rules engine off-device needs:

1. Durable room state (Restart-safe) — Postgres or Redis, not only function memory
2. Auth: verify `from` session matches the seated founder before applying
3. Duplicate suppression of `commit_actor_state` size (already improved client-side)
4. Host disconnect / rehost protocol
5. Cap / rate limits per room

Scaffold: `supabase/functions/fs-board-authority/` — contract stub only.

## Client switch (future)

```ts
// realtimeClient / useOnlineBoardSync
const remoteAuthority = import.meta.env.VITE_REMOTE_AUTHORITY === '1'
if (remoteAuthority) {
  // POST action to Edge Function; listen only for broadcast results
} else {
  // current host-device path
}
```

Until then, host-device authority remains default for TestFlight and web.

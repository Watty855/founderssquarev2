/**
 * Founders Square — board authority Edge Function (scaffold).
 *
 * Not wired yet. Deploy + client `VITE_REMOTE_AUTHORITY` will switch hosts from
 * in-WKWebView authority (`onlineRoomAuthority.ts`) to this service.
 *
 * Contract mirrors AuthorityOutbound / GameAction from the web client.
 *
 * Deno.serve(async (req) => {
 *   const { room, from, actionId, action } = await req.json()
 *   // load store for room → applyGameAction → broadcast via Supabase Realtime admin
 *   return new Response(JSON.stringify({ ok: true, rev }), { headers: cors })
 * })
 *
 * See docs/REMOTE_AUTHORITY.md
 */

Deno.serve((_req) => {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'fs-board-authority scaffold — not implemented. Host-device authority is active.',
    }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  )
})

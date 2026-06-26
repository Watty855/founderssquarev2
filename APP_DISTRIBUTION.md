# Founders Square — App distribution (phone, iPad, Mac, PC)

Founders Square v2 is one React codebase shipped to every platform through **Capacitor**
(mobile/tablet) and installable web builds (Mac/PC desktop).

## Platform map

| Platform | Technology | How players get it |
| --- | --- | --- |
| **iPhone** | Capacitor → iOS | App Store or TestFlight |
| **iPad** | Same iOS app (universal) | App Store or TestFlight |
| **Android phone/tablet** | Capacitor → Android | Google Play |
| **Mac** | iOS app + **Mac Catalyst** in Xcode, or PWA | Mac App Store / install from site |
| **Windows PC** | PWA install or future Electron wrap | “Install app” in Edge/Chrome |

Online multiplayer works the same in every build: Supabase Realtime + room codes.
No website URL is required once the app is installed.

---

## One-time developer setup

### All platforms
```bash
cd founderssquarev2
npm install
cp .env.example .env   # add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
```

Env vars are **baked in at build time** — set production Supabase keys before `npm run build`.

### iOS + iPad + Mac Catalyst
- macOS with **Xcode 15+** installed from the **Mac App Store** (Command Line Tools alone are not enough)
- [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- **CocoaPods** (installed on this machine to `~/.gem/ruby/2.6.0/bin` — add to your shell `PATH`)

Add CocoaPods to your `~/.zshrc` (once):

```bash
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
```

After installing Xcode from the App Store, point `xcode-select` at it (once):

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

```bash
npm run build
npm run cap:add:ios       # first time only — creates ios/ (already done in repo)
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
npx cap sync ios          # runs pod install (needs full Xcode)
npm run cap:ios           # sync + open Xcode
```

In Xcode:
1. Select the **Founders Square** target → Signing & Capabilities → your Team.
2. **iPhone/iPad:** Product → Archive → Distribute → TestFlight / App Store.
3. **Mac:** Target → General → check **Mac Catalyst** (or “Designed for iPad” on Mac).
   Archive the Mac variant for Mac App Store, or distribute the iOS build via Catalyst.

### Android
- [Android Studio](https://developer.android.com/studio)
- Google Play Console ($25 one-time)

```bash
npm run build
npx cap add android      # first time only — creates android/
npx cap sync android
npx cap open android
```

In Android Studio: Build → Generate Signed Bundle (AAB) → upload to Play Console.

---

## Day-to-day dev commands

```bash
npm run dev              # browser at localhost:5173
npm run build            # production web bundle → dist/
npm run cap:sync         # build + copy into native projects
npm run cap:ios          # sync + open Xcode
npm run cap:android      # sync + open Android Studio
```

After changing game code, always `npm run cap:sync` before running on a device.

---

## How multiplayer works in the app

1. **Guest (phone/iPad/Mac/PC app):** Title → **Join friend's game** → room code → **Join and wait**.
2. **Host:** Title → **Play online** → room code → **Host this table** → seat founders from **Party roster** → **Start game**.
3. Guests **auto-enter** when the host starts — no post-start “join” step.

Guests must be in the room **before** Start game so the host can seat them from the roster.

---

## Mac & PC without app stores (PWA)

For quick desktop testing without store review:

```bash
npm run build
npm run preview          # or deploy dist/ to any static host
```

In Chrome or Edge: menu → **Install Founders Square** / **Add to Dock**.

For a native-feel Windows/Mac installer later, wrap `dist/` with [Electron](https://www.electronjs.org/)
or Tauri — the game code stays unchanged.

---

## Production checklist

- [ ] Production Supabase project (Realtime enabled)
- [ ] `VITE_SUPABASE_*` set in `.env` before `npm run build`
- [ ] App icons & splash (`resources/` — use `@capacitor/assets` when ready)
- [ ] iOS: privacy strings in `Info.plist` if using camera/mic later
- [ ] Android: `AndroidManifest.xml` network permission (Capacitor adds by default)
- [ ] TestFlight / internal Play track with 2+ devices on different networks
- [ ] Room-code flow: guest **Join and wait** → host **Start game** → both see live board

---

## Next engineering steps

1. **App icons & splash screens** (`npx @capacitor/assets generate`)
2. **TestFlight beta** with 2–4 founders on iPhone + Android
3. **Mac Catalyst** toggle in Xcode for Mac App Store
4. **Optional:** Electron shell for Windows installer
5. **Optional:** Move game authority to Supabase Edge Function for ranked/public play

See also [MOBILE_APP.md](./MOBILE_APP.md) for online architecture.

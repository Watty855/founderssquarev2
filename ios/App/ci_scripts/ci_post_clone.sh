#!/bin/sh
set -euo pipefail

# Xcode Cloud: Pods/ and App/public are gitignored. Capacitor pods also
# resolve from ../../node_modules, so Node deps must exist before pod install.
# Runs from ios/App/ci_scripts (cwd). Repo root is CI_PRIMARY_REPOSITORY_PATH.

ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$ROOT"

echo "==> Installing Node (Capacitor pods path into node_modules)"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
node -v
npm -v

echo "==> npm ci"
npm ci

# Bake Vite env from Xcode Cloud environment variables (set in App Store Connect).
if [ -n "${VITE_SUPABASE_URL:-}" ] && [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  echo "==> Writing .env from Xcode Cloud secrets"
  cat > .env <<ENV
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV
else
  echo "==> WARNING: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set in Xcode Cloud env; online multiplayer will be disabled in this build."
fi

echo "==> Building web bundle + Capacitor sync"
npm run build
npx cap sync ios

echo "==> pod install"
cd "$ROOT/ios/App"
pod install --repo-update

echo "==> ci_post_clone complete"

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.founderssquare.game',
  appName: 'Founders Square',
  webDir: 'dist',
  backgroundColor: '#0a0a0f',
  ios: {
    contentInset: 'always',
    // Beta diagnostics: allows attaching Safari Web Inspector to TestFlight builds
    // to debug in-game freezes. Disable before public App Store release.
    webContentsDebuggingEnabled: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0a0a0f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
  },
}

export default config

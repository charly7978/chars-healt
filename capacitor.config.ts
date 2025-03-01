import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.charshealt.app',
  appName: 'chars-healt',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*']
  },
  android: {
    // Configuración para Android
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    initialFocus: true,
    backgroundColor: "#000000"
  },
  plugins: {
    Camera: {
      permissionType: "camera",
      androidPermissions: [
        "android.permission.CAMERA"
      ]
    },
    Permissions: {
      permissions: ["camera"]
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    CapacitorHttp: {
      enabled: true
    },
    WebView: {
      allowFileAccess: true,
      allowContentAccess: true,
      scrollEnabled: false,
      overScrollMode: 'never',
      geolocationEnabled: false
    }
  }
};

export default config;


import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.30d3cd84f3174223a76cd460578ae3cc',
  appName: 'chars-healt',
  webDir: 'dist',
  server: {
    url: 'https://30d3cd84-f317-4223-a76c-d460578ae3cc.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  android: {
    path: './android',
    useLegacyBridge: true,
    appendUserAgent: 'CharsHealth App',
    permissions: [
      "android.permission.CAMERA",
      "android.permission.FLASHLIGHT",
      "android.permission.MODIFY_AUDIO_SETTINGS"
    ]
  },
  plugins: {
    PermissionsAndroid: {
      camera: true,
      microphone: true
    }
  }
};

export default config;

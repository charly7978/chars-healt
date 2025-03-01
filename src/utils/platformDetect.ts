
/**
 * Platform detection utility functions
 * Helps identify the current platform, browser, and available capabilities
 */

/**
 * Check if the app is running in a Capacitor environment
 */
export const isCapacitorAvailable = (): boolean => {
  return typeof (window as any).Capacitor !== 'undefined';
};

/**
 * Check if the app is running on a native platform through Capacitor
 */
export const isNativePlatform = (): boolean => {
  return isCapacitorAvailable() && (window as any).Capacitor.isNativePlatform();
};

/**
 * Check if the device is running Android
 */
export const isAndroid = (): boolean => {
  return /android/i.test(navigator.userAgent.toLowerCase());
};

/**
 * Check if the device is running iOS
 */
export const isIOS = (): boolean => {
  return /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase()) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !(window as any).MSStream);
};

/**
 * Check if the device is a mobile device
 */
export const isMobile = (): boolean => {
  return isAndroid() || isIOS() || 
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      navigator.userAgent.toLowerCase()
    );
};

/**
 * Check if the device has a relatively modern browser capable of advanced features
 */
export const hasModernBrowser = (): boolean => {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.MediaStreamTrack &&
    typeof (window as any).ImageCapture !== 'undefined'
  );
};

/**
 * Check if the device supports torch/flashlight capability
 * @param stream An optional MediaStream to check for torch capability
 */
export const hasTorchCapability = async (stream?: MediaStream): Promise<boolean> => {
  try {
    // Use provided stream or get a new one
    let mediaStream = stream;
    let needToStopStream = false;
    
    if (!mediaStream) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment'
          } 
        });
        needToStopStream = true;
      } catch (err) {
        console.error('Error accessing camera to check torch capability:', err);
        return false;
      }
    }
    
    const videoTrack = mediaStream.getVideoTracks()[0];
    if (!videoTrack) return false;
    
    const hasTorch = !!videoTrack.getCapabilities?.()?.torch;
    
    // Clean up if we created a new stream
    if (needToStopStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    
    return hasTorch;
  } catch (err) {
    console.error('Error checking torch capability:', err);
    return false;
  }
};

/**
 * Check if the browser supports screen orientation locking
 */
export const supportsOrientationLock = (): boolean => {
  return !!(screen.orientation?.lock);
};

/**
 * Check if the browser supports fullscreen mode
 */
export const supportsFullscreen = (): boolean => {
  const elem = document.documentElement;
  return !!(
    elem.requestFullscreen ||
    (elem as any).webkitRequestFullscreen ||
    (elem as any).mozRequestFullScreen ||
    (elem as any).msRequestFullscreen
  );
};

/**
 * Get information about the device's capabilities related to PPG sensing
 */
export const getPPGCapabilities = async (): Promise<{
  hasCamera: boolean;
  hasTorch: boolean;
  hasModernBrowser: boolean;
  isNative: boolean;
}> => {
  let hasCamera = false;
  let hasTorch = false;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    hasCamera = true;
    hasTorch = await hasTorchCapability(stream);
    stream.getTracks().forEach(track => track.stop());
  } catch (err) {
    console.log('Camera not available:', err);
  }
  
  return {
    hasCamera,
    hasTorch,
    hasModernBrowser: hasModernBrowser(),
    isNative: isNativePlatform()
  };
};

/**
 * Detect if the device is in low power mode
 * Note: There's no standard API for this, so we use heuristics
 */
export const detectLowPowerMode = async (): Promise<boolean> => {
  // On iOS, we can use the devicelight event if available
  if (typeof (window as any).devicelight !== 'undefined') {
    return false; // No reliable way to detect
  }
  
  // On Android, we can check battery status
  if ('getBattery' in navigator) {
    try {
      const battery = await (navigator as any).getBattery();
      // Consider low power mode if battery is below 20% and not charging
      return battery.level < 0.2 && !battery.charging;
    } catch (err) {
      console.error('Error accessing battery info:', err);
    }
  }
  
  // Default fallback
  return false;
}; 

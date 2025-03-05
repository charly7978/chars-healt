
/**
 * Utility functions for camera operations
 */

/**
 * Gets device type based on user agent
 * @returns true if the device is Android
 */
export const isAndroidDevice = (): boolean => {
  return /android/i.test(navigator.userAgent.toLowerCase());
};

/**
 * Creates camera constraints based on device type
 * @param isAndroid Whether the device is Android
 * @returns MediaStreamConstraints object
 */
export const createCameraConstraints = (isAndroid: boolean): MediaStreamConstraints => {
  return {
    video: {
      facingMode: 'environment',
      width: isAndroid ? { ideal: 1280 } : { ideal: 640 },
      height: isAndroid ? { ideal: 720 } : { ideal: 480 },
      frameRate: { ideal: isAndroid ? 24 : 30 }
    },
    audio: false
  };
};

/**
 * Applies Android-specific camera optimizations
 * @param videoTrack The video track to optimize
 * @returns Promise that resolves when optimizations are applied
 */
export const applyAndroidOptimizations = async (videoTrack: MediaStreamTrack): Promise<void> => {
  try {
    if ('getCapabilities' in videoTrack) {
      const capabilities = videoTrack.getCapabilities();
      const settings: MediaTrackConstraints = {};
      
      if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
        settings.exposureMode = 'continuous';
      }
      
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        settings.focusMode = 'continuous';
      }
      
      if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
        settings.whiteBalanceMode = 'continuous';
      }
      
      if (Object.keys(settings).length > 0) {
        await videoTrack.applyConstraints(settings);
      }
    }
  } catch (err) {
    console.error("Error applying Android optimizations:", err);
  }
};

/**
 * Controls the torch/flashlight of the device
 * @param videoTrack The video track with torch capability
 * @param turnOn Whether to turn on the torch
 * @returns Promise that resolves when the torch state is changed
 */
export const controlTorch = async (videoTrack: MediaStreamTrack, turnOn: boolean): Promise<void> => {
  try {
    if ('getCapabilities' in videoTrack && videoTrack.getCapabilities()?.torch) {
      await videoTrack.applyConstraints({
        advanced: [{ torch: turnOn }]
      });
      console.log(`CameraView: Torch ${turnOn ? 'activated' : 'deactivated'}`);
    } else if (turnOn) {
      console.log("CameraView: Torch not available");
    }
  } catch (e) {
    console.error(`Error ${turnOn ? 'activating' : 'deactivating'} torch:`, e);
  }
};

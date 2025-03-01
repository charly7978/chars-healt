
import React, { useRef, useEffect, useState, useCallback } from 'react';
import deviceContextService from '../services/DeviceContextService';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  // Extended capabilities are commented out as they cause TypeScript errors
}

interface ExtendedMediaTrackConstraints extends MediaTrackConstraints {
  // Extended constraints are commented out as they cause TypeScript errors
}

const CameraView = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);
  const flashIntensityRef = useRef<number>(0);
  const lastFlashAdjustTimeRef = useRef<number>(0);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const processingFramesRef = useRef(false);
  const cameraInitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const streamReadyNotifiedRef = useRef(false);
  const stableStreamTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect if we're on Android - only compute this once
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
  }, []);

  // Function to adjust flash intensity based on ambient light
  const adjustFlashIntensity = useCallback(async () => {
    if (!trackRef.current || !streamRef.current || !isMonitoring) {
      return;
    }
    
    try {
      // Validate track is still available and active
      if (trackRef.current.readyState !== 'live' || !trackRef.current.getCapabilities()?.torch) {
        return;
      }
      
      // Limit how often we adjust flash (max once per second)
      const now = Date.now();
      if (now - lastFlashAdjustTimeRef.current < 1000) {
        return;
      }
      lastFlashAdjustTimeRef.current = now;
      
      const ambientLight = deviceContextService.ambientLight;
      let newIntensity = 0;
      
      // Set torch based on ambient light
      if (ambientLight === 'low') {
        // Low ambient light - use lower torch power (if device supports it)
        newIntensity = 0.7;
      } else if (ambientLight === 'medium') {
        // Medium ambient light - use medium torch power
        newIntensity = 0.85;
      } else {
        // High ambient light or unknown - use full torch power
        newIntensity = 1;
      }
      
      if (flashIntensityRef.current !== newIntensity) {
        console.log(`CameraView: Adjusting flash intensity to ${newIntensity} based on ambient light: ${ambientLight}`);
        flashIntensityRef.current = newIntensity;
        
        // Check if track is still live before applying constraints
        if (trackRef.current.readyState === 'live') {
          await trackRef.current.applyConstraints({
            advanced: [{ torch: true }]
          });
        }
      }
    } catch (e) {
      console.error("Error adjusting flash intensity:", e);
    }
  }, [isMonitoring]);

  // Function to safely stop the camera and release resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Stopping camera");
    
    // Clear any pending timeouts
    if (cameraInitTimeoutRef.current) {
      clearTimeout(cameraInitTimeoutRef.current);
      cameraInitTimeoutRef.current = null;
    }
    
    if (stableStreamTimerRef.current) {
      clearTimeout(stableStreamTimerRef.current);
      stableStreamTimerRef.current = null;
    }
    
    // First, mark that we're no longer processing frames
    processingFramesRef.current = false;
    streamReadyNotifiedRef.current = false;
    
    // Clear the video element first
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error cleaning video element:", err);
      }
    }
    
    // Then handle the stream
    if (streamRef.current) {
      try {
        // Safe way to stop all tracks
        const tracks = streamRef.current.getTracks();
        
        // Process each track
        tracks.forEach(track => {
          try {
            // First disable torch if available and track is live
            if (track.readyState === 'live' && track.getCapabilities()?.torch) {
              try {
                console.log("CameraView: Disabling flashlight");
                track.applyConstraints({
                  advanced: [{ torch: false }]
                }).catch(err => console.error("Error disabling flashlight:", err));
              } catch (err) {
                console.error("Error disabling flashlight:", err);
              }
            }
            
            // Wait a moment before stopping the track (helps with Android)
            setTimeout(() => {
              try {
                if (track.readyState === 'live') {
                  console.log("CameraView: Stopping video track");
                  track.stop();
                }
              } catch (err) {
                console.error("Error stopping track:", err);
              }
            }, 100);
          } catch (error) {
            console.error("General error when stopping track:", error);
          }
        });
      } catch (error) {
        console.error("Error stopping media stream:", error);
      }

      // Clear references
      streamRef.current = null;
      trackRef.current = null;
    }
    
    // Reset flash state
    flashIntensityRef.current = 0;
    
    // Reset retry count
    retryCountRef.current = 0;
  }, []);

  // Function to start the camera with optimized settings
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: Not starting camera because isMonitoring is false");
      return;
    }
    
    initializingRef.current = true;
    console.log("CameraView: Starting camera, attempt #" + (retryCountRef.current + 1));
    setError(null);
    streamReadyNotifiedRef.current = false;
    
    try {
      // Make sure any previous stream is stopped properly
      stopCamera();
      
      // Wait for resources to be released (especially on Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 500 : 200));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia API is not available');
      }

      // Adapt resolution based on device battery state
      const lowPowerMode = deviceContextService.isBatterySavingMode;
      console.log(`CameraView: Device in power saving mode: ${lowPowerMode}`);
      
      // Optimized camera configuration for each platform
      const constraints: MediaStreamConstraints = isAndroid 
        ? {
            video: {
              facingMode: 'environment',
              width: lowPowerMode ? { ideal: 320, max: 640 } : { ideal: 640, max: 1280 },
              height: lowPowerMode ? { ideal: 240, max: 480 } : { ideal: 480, max: 720 },
              frameRate: lowPowerMode ? { ideal: 10, max: 15 } : { ideal: 15, max: 24 }
            },
            audio: false
          }
        : {
            video: {
              facingMode: 'environment',
              width: lowPowerMode ? { ideal: 480, max: 640 } : { ideal: 640 },
              height: lowPowerMode ? { ideal: 360, max: 480 } : { ideal: 480 },
              frameRate: lowPowerMode ? { ideal: 15, max: 20 } : { ideal: 20, max: 30 }
            },
            audio: false
          };

      // Add a timeout to prevent hanging if getUserMedia takes too long
      const getUserMediaPromise = navigator.mediaDevices.getUserMedia(constraints);
      const timeoutPromise = new Promise<MediaStream>((_, reject) => {
        cameraInitTimeoutRef.current = setTimeout(() => {
          reject(new Error('Camera initialization timeout'));
        }, 10000); // 10 second timeout
      });
      
      // Try to access the camera with timeout
      console.log("CameraView: Requesting camera access with constraints:", constraints);
      const mediaStream = await Promise.race([getUserMediaPromise, timeoutPromise]);
      
      // Clear the timeout since we got a result
      if (cameraInitTimeoutRef.current) {
        clearTimeout(cameraInitTimeoutRef.current);
        cameraInitTimeoutRef.current = null;
      }

      console.log("CameraView: Camera access granted, tracks:", mediaStream.getTracks().length);
      
      // Check if component is still mounted and monitoring
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Component unmounted or not monitoring, releasing stream");
        mediaStream.getTracks().forEach(track => track.stop());
        initializingRef.current = false;
        return;
      }

      // Store references
      streamRef.current = mediaStream;
      const videoTrack = mediaStream.getVideoTracks()[0];
      trackRef.current = videoTrack;

      // Apply specific optimizations for Android
      if (isAndroid && videoTrack && videoTrack.readyState === 'live') {
        console.log("CameraView: Applying Android optimizations");
        try {
          // Android optimizations
          const capabilities = videoTrack.getCapabilities() as ExtendedMediaTrackCapabilities;
          const settings: ExtendedMediaTrackConstraints = {};
          
          // Only apply constraints that are actually available and beneficial
          if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
            settings.exposureMode = 'continuous';
          }
          
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            settings.focusMode = 'continuous';
          }
          
          if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
            settings.whiteBalanceMode = 'continuous';
          }
          
          if (Object.keys(settings).length > 0 && videoTrack.readyState === 'live') {
            await videoTrack.applyConstraints(settings);
            console.log("CameraView: Android optimizations applied", settings);
          }
        } catch (err) {
          console.error("Error applying Android optimizations:", err);
        }
      }

      // Set up the video element
      if (videoRef.current) {
        console.log("CameraView: Assigning stream to video element");
        
        // Check if the track is still available before proceeding
        if (!videoTrack || videoTrack.readyState !== 'live') {
          throw new Error('Video track is not available or not live');
        }
        
        // Specific optimizations for the video element on Android
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
          
          // Set playsinline and muted to improve performance
          videoRef.current.setAttribute('playsinline', '');
          videoRef.current.muted = true;
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // On Android, wait for optimizations to apply before playing
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 50));
        
        try {
          await videoRef.current.play();
          console.log("CameraView: Video playing correctly");
        } catch (e) {
          console.error("Error playing video:", e);
          throw e;
        }
      } else {
        console.error("CameraView: Video element is not available");
      }

      // Wait a moment before activating the flashlight on Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 100));

      // Mark that we're ready to process frames
      processingFramesRef.current = true;
      
      // Reset retry counter after successful initialization
      retryCountRef.current = 0;

      // Initial flash adjustment based on ambient conditions
      if (videoTrack.readyState === 'live') {
        await adjustFlashIntensity();
      
        // Set up periodic flash intensity adjustment
        const flashAdjustInterval = setInterval(() => {
          if (isMonitoring && videoTrack && videoTrack.readyState === 'live') {
            adjustFlashIntensity();
          } else {
            clearInterval(flashAdjustInterval);
          }
        }, 2000);
      }

      // Wait a bit longer for stream to stabilize before notifying
      if (stableStreamTimerRef.current) {
        clearTimeout(stableStreamTimerRef.current);
      }
      
      stableStreamTimerRef.current = setTimeout(() => {
        // Only notify once per camera start
        if (!streamReadyNotifiedRef.current && onStreamReady && isMonitoring && mountedRef.current) {
          console.log("CameraView: Notifying stream ready after stabilization");
          streamReadyNotifiedRef.current = true;
          onStreamReady(mediaStream);
        }
      }, isAndroid ? 500 : 300);
    } catch (error) {
      console.error('Error starting camera:', error);
      setError(`Error starting camera: ${error instanceof Error ? error.message : String(error)}`);
      
      // Retry logic with exponential backoff
      if (retryCountRef.current < 3 && mountedRef.current && isMonitoring) {
        const backoffTime = Math.min(1000 * Math.pow(2, retryCountRef.current), 5000);
        console.log(`CameraView: Retrying in ${backoffTime}ms (attempt ${retryCountRef.current + 1})`);
        
        setTimeout(() => {
          if (mountedRef.current && isMonitoring) {
            retryCountRef.current++;
            initializingRef.current = false;
            startCamera();
          }
        }, backoffTime);
      } else {
        stopCamera();
      }
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid, adjustFlashIntensity]);

  // Effect to start/stop the camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring changed to:", isMonitoring);
    
    if (isMonitoring) {
      // Use a longer timeout for Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 500 : 200);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Cleanup effect when mounting/unmounting the component
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Component mounted");

    // Check if camera permissions are available
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Just checking permissions, stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        console.log("CameraView: Camera permissions verified");
      })
      .catch(err => {
        console.error("CameraView: Error verifying camera permissions:", err);
        setError(`Permission error: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      console.log("CameraView: Component unmounting");
      mountedRef.current = false;
      processingFramesRef.current = false;
      streamReadyNotifiedRef.current = false;
      stopCamera();
      
      // Clear any pending timeouts
      if (cameraInitTimeoutRef.current) {
        clearTimeout(cameraInitTimeoutRef.current);
        cameraInitTimeoutRef.current = null;
      }
      
      if (stableStreamTimerRef.current) {
        clearTimeout(stableStreamTimerRef.current);
        stableStreamTimerRef.current = null;
      }
    };
  }, [stopCamera]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover ${!isMonitoring ? 'hidden' : ''}`}
        style={{
          transform: 'translateZ(0)', // Hardware acceleration
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          willChange: isAndroid ? 'transform' : 'auto',
        }}
      />
      {error && (
        <div className="absolute top-0 left-0 z-50 bg-red-500/80 text-white p-2 text-sm font-medium rounded m-2">
          {error}
        </div>
      )}
    </>
  );
};

export default React.memo(CameraView);

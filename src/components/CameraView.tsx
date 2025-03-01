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
  const [isCapacitor, setIsCapacitor] = useState(false);
  const flashIntensityRef = useRef<number>(0);
  const lastFlashAdjustTimeRef = useRef<number>(0);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const processingFramesRef = useRef(false);
  const cameraInitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const streamReadyNotifiedRef = useRef(false);
  const stableStreamTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect if we're running in Capacitor or as a regular web app
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
    // Check if we're in Capacitor by looking for its namespace
    setIsCapacitor(typeof (window as any).Capacitor !== 'undefined');
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

  // Function to safely stop the camera and free resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Stopping camera");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // First disable torch if available
        if (track.getCapabilities()?.torch) {
          try {
            console.log("CameraView: Disabling torch");
            track.applyConstraints({
              advanced: [{ torch: false }]
            }).catch(err => console.error("Error disabling torch:", err));
          } catch (err) {
            console.error("Error disabling torch:", err);
          }
        }
        
        // Short delay before stopping the track (helps with Android)
        setTimeout(() => {
          try {
            if (track.readyState === 'live') {
              console.log("CameraView: Stopping video track");
              track.stop();
            }
          } catch (err) {
            console.error("Error stopping track:", err);
          }
        }, isAndroid ? 100 : 50);
      });

      streamRef.current = null;
    }

    // Clean up video element
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error cleaning video element:", err);
      }
    }
  }, [isAndroid]);

  // Function to start the camera
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: Not starting camera because isMonitoring is false");
      return;
    }
    
    initializingRef.current = true;
    console.log("CameraView: Starting camera");
    setError(null);
    
    try {
      // Make sure any previous stream is stopped
      stopCamera();
      
      // Wait for resources to be freed (especially on Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 50));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia API is not available');
      }

      // Camera config optimized for each platform
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: isAndroid ? { ideal: 1280 } : { ideal: 640 },
          height: isAndroid ? { ideal: 720 } : { ideal: 480 },
          frameRate: { ideal: isAndroid ? 24 : 30 }
        },
        audio: false
      };

      // In Capacitor on Android, simplify constraints to avoid issues
      if (isCapacitor && isAndroid) {
        (constraints.video as MediaTrackConstraints).width = { ideal: 640 };
        (constraints.video as MediaTrackConstraints).height = { ideal: 480 };
      }

      // Try to get camera access
      console.log("CameraView: Requesting camera access with constraints:", constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("CameraView: Camera access granted, tracks:", mediaStream.getTracks().length);
      
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Component unmounted or not monitoring, releasing stream");
        mediaStream.getTracks().forEach(track => track.stop());
        initializingRef.current = false;
        return;
      }

      streamRef.current = mediaStream;

      // Configure platform-specific optimizations
      if (isAndroid) {
        console.log("CameraView: Applying Android optimizations");
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            // Android optimizations
            const capabilities = videoTrack.getCapabilities();
            // Only apply one constraint at a time to avoid rejection
            if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
              await videoTrack.applyConstraints({
                exposureMode: 'continuous'
              }).catch(e => console.warn("Could not set exposure mode:", e));
            }
            
            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
              await videoTrack.applyConstraints({
                focusMode: 'continuous'
              }).catch(e => console.warn("Could not set focus mode:", e));
            }
          } catch (err) {
            console.error("Error applying Android optimizations:", err);
          }
        }
      }

      // Set up video element
      if (videoRef.current) {
        console.log("CameraView: Assigning stream to video element");
        
        // Platform-specific video element optimizations
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // On Android, wait for optimizations to apply before playing
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : 0));
        
        await videoRef.current.play().catch(e => {
          console.error("Error playing video:", e);
          throw e;
        });
        console.log("CameraView: Video playing correctly");
      } else {
        console.error("CameraView: Video element is not available");
      }

      // Wait before activating torch on Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 0));

      // Try to activate torch if we're monitoring
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack && videoTrack.getCapabilities()?.torch) {
        try {
          console.log("CameraView: Trying to activate torch");
          await videoTrack.applyConstraints({
            advanced: [{ torch: true }]
          });
          console.log("CameraView: Torch activated");
        } catch (e) {
          console.error("Error configuring torch:", e);
        }
      } else {
        console.log("CameraView: Torch not available");
      }

      // Notify that stream is ready
      if (onStreamReady && isMonitoring) {
        console.log("CameraView: Notifying stream ready");
        onStreamReady(mediaStream);
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      setError(`Camera error: ${error instanceof Error ? error.message : String(error)}`);
      stopCamera();
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid, isCapacitor]);

  // Effect to start/stop camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring changed to:", isMonitoring);
    
    if (isMonitoring) {
      // Use longer timeout for Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 500 : 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Cleanup effect when mounting/unmounting component
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Component mounted");

    // Make sure camera permissions are available
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Just checking permissions, stop stream immediately
        stream.getTracks().forEach(track => track.stop());
        console.log("CameraView: Camera permissions verified");
      })
      .catch(err => {
        console.error("CameraView: Camera permission error:", err);
        setError(`Permission error: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      console.log("CameraView: Component unmounting");
      mountedRef.current = false;
      stopCamera();
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


import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
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
  const lastMonitoringStateRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);

  // Detect if we're on Android
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
    console.log("CameraView: Device detection - Android:", /android/i.test(userAgent));
  }, []);

  // Function to stop the camera and release resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Stopping camera");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // First disable the torch if available
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
        }, 100); // Increased timeout for more reliable cleanup
      });

      streamRef.current = null;
    }

    // Clean up the video element
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error cleaning video element:", err);
      }
    }
  }, []);

  // Function to start the camera
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: Not starting camera because isMonitoring is false");
      return;
    }
    
    // Update last monitoring state
    lastMonitoringStateRef.current = isMonitoring;
    
    initializingRef.current = true;
    console.log("CameraView: Starting camera, isMonitoring:", isMonitoring);
    setError(null);
    
    try {
      // Ensure any previous stream is stopped
      stopCamera();
      
      // Wait a moment for resources to be released (especially on Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 500 : 100)); // Increased for more reliable initialization

      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Component unmounted or isMonitoring changed during initialization");
        initializingRef.current = false;
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia API is not available');
      }

      // Camera configuration optimized for each platform
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: isAndroid ? { ideal: 1280 } : { ideal: 640 },
          height: isAndroid ? { ideal: 720 } : { ideal: 480 },
          frameRate: { ideal: isAndroid ? 24 : 30 }
        },
        audio: false
      };

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

      // Configure specific optimizations for Android
      if (isAndroid) {
        console.log("CameraView: Applying optimizations for Android");
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            // Android optimizations
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
              console.log("CameraView: Android optimizations applied", settings);
            }
          } catch (err) {
            console.error("Error applying Android optimizations:", err);
          }
        }
      }

      // Configure the video element
      if (videoRef.current) {
        console.log("CameraView: Assigning stream to video element");
        
        // Specific optimizations for video element on Android
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // On Android, wait for optimizations to apply before playing
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 50));
        
        await videoRef.current.play().catch(e => {
          console.error("Error playing video:", e);
          throw e;
        });
        console.log("CameraView: Video playing correctly");
      } else {
        console.error("CameraView: Video element is not available");
        throw new Error("Video element not available");
      }

      // Wait a moment before activating the torch on Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 100));

      // Try to activate the torch if we're monitoring
      if (isMonitoring) {
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
      }

      // Notify that the stream is ready
      if (onStreamReady && isMonitoring && mountedRef.current) {
        console.log("CameraView: Notifying stream ready");
        // Small delay to ensure everything is initialized properly
        setTimeout(() => {
          if (mountedRef.current && isMonitoring && mediaStream.active) {
            onStreamReady(mediaStream);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      setError(`Error starting camera: ${error instanceof Error ? error.message : String(error)}`);
      stopCamera();
    } finally {
      if (mountedRef.current) {
        initializingRef.current = false;
      }
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid]);

  // Effect to start/stop the camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring changed to:", isMonitoring, "lastState:", lastMonitoringStateRef.current);
    
    // Avoid redundant changes
    if (isMonitoring === lastMonitoringStateRef.current && !isMonitoring) {
      console.log("CameraView: Monitoring state didn't really change, ignoring");
      return;
    }
    
    lastMonitoringStateRef.current = isMonitoring;
    
    if (isMonitoring) {
      // Use a longer timeout for Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 800 : 200); // Increased timeouts for more reliable startup
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Cleanup effect when mounting/unmounting the component
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Component mounted");

    // Ensure camera permissions are available
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          // We just check permissions, stop the stream immediately
          stream.getTracks().forEach(track => track.stop());
          console.log("CameraView: Camera permissions verified");
        })
        .catch(err => {
          console.error("CameraView: Error verifying camera permissions:", err);
          setError(`Permission error: ${err instanceof Error ? err.message : String(err)}`);
        });
    } else {
      console.error("CameraView: getUserMedia not supported");
      setError("Camera API not supported in this browser");
    }

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

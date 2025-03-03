
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView: React.FC<CameraViewProps> = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);
  const initializingRef = useRef(false);
  const torchEnabledRef = useRef(false);
  const mountedRef = useRef(true);
  const attemptCountRef = useRef(0);
  const frameProcessingRef = useRef<boolean>(false);

  // Detect if we're on Android
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroidDevice = /android/i.test(userAgent);
    setIsAndroid(isAndroidDevice);
    console.log("CameraView: Device detection - Android:", isAndroidDevice);
  }, []);

  // Function to stop the camera and release resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Stopping camera");
    
    // First disable torch if it was enabled
    if (torchEnabledRef.current && streamRef.current) {
      try {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack && videoTrack.getCapabilities()?.torch) {
          console.log("CameraView: Disabling torch before stopping camera");
          videoTrack.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error disabling torch:", err));
          torchEnabledRef.current = false;
        }
      } catch (err) {
        console.error("Error disabling torch during cleanup:", err);
      }
    }
    
    // Stop frame processing
    frameProcessingRef.current = false;
    
    // Stop all tracks from the stream
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          if (track.readyState === 'live') {
            console.log(`CameraView: Stopping ${track.kind} track`);
            track.stop();
          }
        });
        streamRef.current = null;
      } catch (err) {
        console.error("Error stopping media tracks:", err);
      }
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
    
    // Reset state
    torchEnabledRef.current = false;
    initializingRef.current = false;
  }, []);

  // Function to start the camera
  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    if (initializingRef.current) {
      console.log("CameraView: Already initializing camera, ignoring duplicate call");
      return;
    }
    
    if (!isMonitoring) {
      console.log("CameraView: Not starting camera because isMonitoring is false");
      return;
    }
    
    initializingRef.current = true;
    attemptCountRef.current++;
    const currentAttempt = attemptCountRef.current;
    
    console.log(`CameraView: Starting camera (attempt ${currentAttempt}), isMonitoring:`, isMonitoring);
    setError(null);
    
    try {
      // Ensure any previous stream is properly stopped
      stopCamera();
      
      // Wait to ensure resources are released properly
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 1000 : 500));
      
      // Verify component is still mounted and monitoring is still active
      if (!mountedRef.current || !isMonitoring || currentAttempt !== attemptCountRef.current) {
        console.log("CameraView: State changed during initialization, aborting");
        initializingRef.current = false;
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API not available in this browser');
      }

      // Camera configuration optimized for each platform
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: isAndroid ? 1280 : 640 },
          height: { ideal: isAndroid ? 720 : 480 },
          frameRate: { ideal: isAndroid ? 24 : 30 }
        },
        audio: false
      };

      console.log("CameraView: Requesting camera access with constraints:", JSON.stringify(constraints));
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify component is still mounted and we're still monitoring
      if (!mountedRef.current || !isMonitoring || currentAttempt !== attemptCountRef.current) {
        console.log("CameraView: State changed during camera access, cleaning up and aborting");
        mediaStream.getTracks().forEach(track => track.stop());
        initializingRef.current = false;
        return;
      }

      console.log("CameraView: Camera access granted, tracks:", mediaStream.getTracks().length);
      streamRef.current = mediaStream;

      // Configure video element
      if (videoRef.current) {
        console.log("CameraView: Configuring video element");
        
        // Apply platform-specific optimizations
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // Wait for video to be ready to play
        videoRef.current.onloadedmetadata = async () => {
          if (!videoRef.current || !mountedRef.current || !isMonitoring || currentAttempt !== attemptCountRef.current) {
            console.log("CameraView: State changed after video loaded, aborting");
            stopCamera();
            return;
          }
          
          try {
            console.log("CameraView: Video metadata loaded, playing...");
            await videoRef.current.play();
            console.log("CameraView: Video playing successfully");
            
            // If we're still monitoring, try to enable torch and notify stream is ready
            if (isMonitoring && mountedRef.current && currentAttempt === attemptCountRef.current) {
              // Wait a little before trying to enable torch
              setTimeout(async () => {
                if (!mountedRef.current || !isMonitoring || currentAttempt !== attemptCountRef.current) return;
                
                try {
                  // Try to activate torch if available
                  if (streamRef.current) {
                    const videoTrack = streamRef.current.getVideoTracks()[0];
                    if (videoTrack && videoTrack.getCapabilities()?.torch) {
                      console.log("CameraView: Enabling torch");
                      await videoTrack.applyConstraints({
                        advanced: [{ torch: true }]
                      });
                      torchEnabledRef.current = true;
                      console.log("CameraView: Torch enabled successfully");
                    } else {
                      console.log("CameraView: Torch not available on this device");
                    }
                  }
                } catch (e) {
                  console.error("CameraView: Error enabling torch:", e);
                }
                
                // Mark that frame processing can begin and notify stream is ready
                frameProcessingRef.current = true;
                
                // Notify that stream is ready after a short delay
                setTimeout(() => {
                  if (streamRef.current && mountedRef.current && isMonitoring && 
                      onStreamReady && currentAttempt === attemptCountRef.current) {
                    console.log("CameraView: Notifying stream is ready");
                    onStreamReady(streamRef.current);
                  }
                }, 500);
              }, isAndroid ? 800 : 500);
            }
          } catch (e) {
            console.error("CameraView: Error playing video:", e);
            setError(`Error playing video: ${e instanceof Error ? e.message : String(e)}`);
            stopCamera();
          }
        };
        
        // Handle video errors
        videoRef.current.onerror = (e) => {
          console.error("CameraView: Video element error:", e);
          setError(`Video error: ${e instanceof Error ? e.message : 'Unknown error'}`);
          stopCamera();
        };
      } else {
        console.error("CameraView: Video element is null");
        throw new Error("Video element not available");
      }
    } catch (error) {
      console.error('CameraView: Error starting camera:', error);
      setError(`Camera error: ${error instanceof Error ? error.message : String(error)}`);
      stopCamera();
      
      // Retry camera initialization after a delay if we're still monitoring
      if (mountedRef.current && isMonitoring && currentAttempt === attemptCountRef.current) {
        console.log("CameraView: Will retry camera initialization after delay");
        setTimeout(() => {
          if (mountedRef.current && isMonitoring && currentAttempt === attemptCountRef.current) {
            console.log("CameraView: Retrying camera initialization");
            initializingRef.current = false;
            startCamera();
          }
        }, 3000); // Increased delay before retry
      }
    } finally {
      // Set initializing to false only if this is still the current attempt
      if (mountedRef.current && currentAttempt === attemptCountRef.current) {
        initializingRef.current = false;
      }
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid]);

  // Effect to handle monitoring state changes
  useEffect(() => {
    console.log("CameraView: isMonitoring changed to:", isMonitoring);
    
    if (isMonitoring) {
      // Delay starting camera slightly to avoid race conditions
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 1000 : 500); // Increased delays
      return () => clearTimeout(timeoutId);
    } else {
      // Stop camera immediately when monitoring is disabled
      frameProcessingRef.current = false;
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Cleanup effect on mount/unmount
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Component mounted");
    
    // Check for camera permissions
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          // Just checking permissions, stop the stream immediately
          stream.getTracks().forEach(track => track.stop());
          console.log("CameraView: Camera permissions verified");
        })
        .catch(err => {
          console.error("CameraView: Camera permission error:", err);
          setError(`Permission error: ${err instanceof Error ? err.message : String(err)}`);
        });
    } else {
      console.error("CameraView: getUserMedia not supported");
      setError("Camera API not supported in this browser");
    }

    return () => {
      console.log("CameraView: Component unmounting");
      mountedRef.current = false;
      frameProcessingRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  // Expose frameProcessingRef to parent via a custom property
  if (videoRef.current) {
    // @ts-ignore - Using a custom property to pass state to parent
    videoRef.current.frameProcessingAllowed = frameProcessingRef.current;
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover ${!isMonitoring ? 'hidden' : ''}`}
        style={{
          transform: 'translateZ(0)',
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
      
      {isMonitoring && isFingerDetected && (
        <div className="absolute bottom-4 right-4 z-40 bg-green-500/80 text-white text-xs py-1 px-2 rounded-full">
          {signalQuality > 0 ? `Signal: ${Math.round(signalQuality)}%` : 'Detecting...'}
        </div>
      )}
    </>
  );
};

export default React.memo(CameraView);

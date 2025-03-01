
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

  // Detect if we're on Android - only compute this once
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
  }, []);

  // Function to adjust flash intensity based on ambient light
  const adjustFlashIntensity = useCallback(async () => {
    if (!trackRef.current || !trackRef.current.getCapabilities()?.torch) {
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
    
    if (isMonitoring && trackRef.current.getCapabilities()?.torch && trackRef.current.readyState === 'live') {
      try {
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
    }
  }, [isMonitoring]);

  // Function to safely stop the camera and release resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    // First, mark that we're no longer processing frames
    processingFramesRef.current = false;
    
    // Clear the video element first
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error limpiando video element:", err);
      }
    }
    
    // Then handle the stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      
      // Process each track
      tracks.forEach(track => {
        try {
          // First disable torch if available and track is live
          if (track.readyState === 'live' && track.getCapabilities()?.torch) {
            try {
              console.log("CameraView: Desactivando linterna");
              track.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(err => console.error("Error desactivando linterna:", err));
            } catch (err) {
              console.error("Error desactivando linterna:", err);
            }
          }
          
          // Wait a moment before stopping the track (helps with Android)
          setTimeout(() => {
            try {
              if (track.readyState === 'live') {
                console.log("CameraView: Deteniendo track de video");
                track.stop();
              }
            } catch (err) {
              console.error("Error deteniendo track:", err);
            }
          }, 100);
        } catch (error) {
          console.error("Error general al detener track:", error);
        }
      });

      // Clear references
      streamRef.current = null;
      trackRef.current = null;
    }
    
    // Reset flash state
    flashIntensityRef.current = 0;
  }, []);

  // Function to start the camera with optimized settings
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: No iniciando cámara porque isMonitoring es false");
      return;
    }
    
    initializingRef.current = true;
    console.log("CameraView: Iniciando cámara");
    setError(null);
    
    try {
      // Make sure any previous stream is stopped properly
      stopCamera();
      
      // Wait for resources to be released (especially on Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 500 : 200));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Adapt resolution based on device battery state
      const lowPowerMode = deviceContextService.isBatterySavingMode;
      console.log(`CameraView: Dispositivo en modo ahorro de energía: ${lowPowerMode}`);
      
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

      // Try to access the camera
      console.log("CameraView: Solicitando acceso a la cámara con constraints:", constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("CameraView: Acceso a la cámara concedido, tracks:", mediaStream.getTracks().length);
      
      // Check if component is still mounted and monitoring
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Componente desmontado o no monitorizando, liberando stream");
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
        console.log("CameraView: Aplicando optimizaciones para Android");
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
            console.log("CameraView: Optimizaciones para Android aplicadas", settings);
          }
        } catch (err) {
          console.error("Error aplicando optimizaciones para Android:", err);
        }
      }

      // Set up the video element
      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        
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
          console.log("CameraView: Video reproduciendo correctamente");
        } catch (e) {
          console.error("Error reproduciendo video:", e);
          throw e;
        }
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Wait a moment before activating the flashlight on Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 100));

      // Mark that we're ready to process frames
      processingFramesRef.current = true;

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

      // Notify that the stream is ready
      if (onStreamReady && isMonitoring && mountedRef.current) {
        console.log("CameraView: Notificando stream listo");
        onStreamReady(mediaStream);
      }
    } catch (error) {
      console.error('Error iniciando la cámara:', error);
      setError(`Error iniciando la cámara: ${error instanceof Error ? error.message : String(error)}`);
      stopCamera();
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid, adjustFlashIntensity]);

  // Effect to start/stop the camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
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
    console.log("CameraView: Componente montado");

    // Check if camera permissions are available
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Just checking permissions, stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        console.log("CameraView: Permisos de cámara verificados");
      })
      .catch(err => {
        console.error("CameraView: Error verificando permisos de cámara:", err);
        setError(`Error de permisos: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      console.log("CameraView: Componente desmontando");
      mountedRef.current = false;
      processingFramesRef.current = false;
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

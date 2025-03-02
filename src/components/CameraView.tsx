
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

// Define custom interface extending the standard definitions
interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  exposureTime?: {
    min: number;
    max: number;
    step: number;
  };
  zoom?: {
    min: number;
    max: number;
    step: number;
  };
}

interface ExtendedMediaTrackConstraints extends MediaTrackConstraints {
  exposureTime?: number;
  zoom?: number;
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

  // Detect if we're on Android - only compute this once
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
  }, []);

  // Function to stop the camera and release resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // First disable torch if available
        if (track.getCapabilities()?.torch) {
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
        }, 50);
      });

      streamRef.current = null;
    }

    // Clear the video element
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error limpiando video element:", err);
      }
    }
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
      // Make sure any previous stream is stopped
      stopCamera();
      
      // Wait for resources to be released (especially on Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 50));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Optimized camera configuration for each platform
      const constraints: MediaStreamConstraints = isAndroid 
        ? {
            video: {
              facingMode: 'environment',
              width: { ideal: 640, max: 1280 },  // Reduced resolution for better performance
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 15, max: 24 }  // Reduced frame rate for better performance
            },
            audio: false
          }
        : {
            video: {
              facingMode: 'environment',
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 20, max: 30 }
            },
            audio: false
          };

      // Try to access the camera
      console.log("CameraView: Solicitando acceso a la cámara con constraints:", constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("CameraView: Acceso a la cámara concedido, tracks:", mediaStream.getTracks().length);
      
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Componente desmontado o no monitorizando, liberando stream");
        mediaStream.getTracks().forEach(track => track.stop());
        initializingRef.current = false;
        return;
      }

      streamRef.current = mediaStream;

      // Apply specific optimizations for Android
      if (isAndroid) {
        console.log("CameraView: Aplicando optimizaciones para Android");
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            // Android optimizations
            const capabilities = videoTrack.getCapabilities() as ExtendedMediaTrackCapabilities;
            const settings: ExtendedMediaTrackConstraints = {};
            
            // Only apply constraints that are actually available and beneficial
            if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
              settings.exposureMode = 'continuous';
            }
            
            // Skip exposureTime setting as it's not standard
            /* 
            if (capabilities.exposureTime) {
              // Set a moderate exposure time for better performance
              const min = capabilities.exposureTime.min || 0;
              const max = capabilities.exposureTime.max || 10000;
              if (min < max) {
                settings.exposureTime = Math.min(Math.max(min + (max - min) * 0.3, min), max);
              }
            }
            */
            
            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
              settings.focusMode = 'continuous';
            }
            
            if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
              settings.whiteBalanceMode = 'continuous';
            }
            
            // Skip zoom setting as it's not standard
            /*
            if (capabilities.zoom) {
              // Apply a slight zoom to focus on the center
              const min = capabilities.zoom.min || 1;
              const max = capabilities.zoom.max || 1;
              if (max > min) {
                settings.zoom = Math.min(min + (max - min) * 0.1, max);
              }
            }
            */
            
            if (Object.keys(settings).length > 0) {
              await videoTrack.applyConstraints(settings);
              console.log("CameraView: Optimizaciones para Android aplicadas", settings);
            }
          } catch (err) {
            console.error("Error aplicando optimizaciones para Android:", err);
          }
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
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : 0));
        
        await videoRef.current.play().catch(e => {
          console.error("Error reproduciendo video:", e);
          throw e;
        });
        console.log("CameraView: Video reproduciendo correctamente");
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Wait a moment before activating the flashlight on Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 0));

      // Try to activate the flashlight if we're monitoring
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack && videoTrack.getCapabilities()?.torch) {
        try {
          console.log("CameraView: Intentando activar linterna");
          await videoTrack.applyConstraints({
            advanced: [{ torch: true }]
          });
          console.log("CameraView: Linterna activada");
        } catch (e) {
          console.error("Error configurando linterna:", e);
        }
      } else {
        console.log("CameraView: Linterna no disponible");
      }

      // Notify that the stream is ready
      if (onStreamReady && isMonitoring) {
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
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid]);

  // Effect to start/stop the camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      // Use a longer timeout for Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 300 : 100);
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

/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
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
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
  }, []);

  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
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

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error limpiando video element:", err);
      }
    }
  }, []);

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
      stopCamera();
      
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 50));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: isAndroid ? { ideal: 1280 } : { ideal: 640 },
          height: isAndroid ? { ideal: 720 } : { ideal: 480 },
          frameRate: { ideal: isAndroid ? 24 : 30 }
        },
        audio: false
      };

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

      if (isAndroid) {
        console.log("CameraView: Aplicando optimizaciones para Android");
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          try {
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
              console.log("CameraView: Optimizaciones para Android aplicadas", settings);
            }
          } catch (err) {
            console.error("Error aplicando optimizaciones para Android:", err);
          }
        }
      }

      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
        }
        
        videoRef.current.srcObject = mediaStream;
        
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : 0));
        
        await videoRef.current.play().catch(e => {
          console.error("Error reproduciendo video:", e);
          throw e;
        });
        console.log("CameraView: Video reproduciendo correctamente");
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 0));

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

  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 500 : 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Componente montado");

    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
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
    <div className="fixed inset-0 pt-16 pb-14 flex flex-col">
      <div className="flex-1 relative overflow-hidden">
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
      </div>
      {error && (
        <div className="absolute top-0 left-0 z-50 bg-red-500/80 text-white p-2 text-sm font-medium rounded m-2">
          {error}
        </div>
      )}
      <div className="h-32 px-4 py-2 grid grid-cols-3 gap-4">
        {/* Add your display components here */}
      </div>
    </div>
  );
};

export default React.memo(CameraView);

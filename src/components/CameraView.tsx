
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

  // Detectar si estamos en Android
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
  }, []);

  // Función para detener la cámara y liberar recursos
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // Primero desactivar la linterna si está disponible
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
        
        // Esperar un momento antes de detener la pista (ayuda con Android)
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

    // Limpiar el video element
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error limpiando video element:", err);
      }
    }
  }, []);

  // Función para iniciar la cámara
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: No iniciando cámara porque isMonitoring es false");
      return;
    }
    
    // Actualizamos el estado de último monitoring
    lastMonitoringStateRef.current = isMonitoring;
    
    initializingRef.current = true;
    console.log("CameraView: Iniciando cámara, isMonitoring:", isMonitoring);
    setError(null);
    
    try {
      // Asegurarse de que cualquier stream previo está detenido
      stopCamera();
      
      // Esperar un momento para que los recursos se liberen (especialmente en Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 50));

      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Componente desmontado o isMonitoring cambió durante inicialización");
        initializingRef.current = false;
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Configuración de la cámara optimizada para cada plataforma
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: isAndroid ? { ideal: 1280 } : { ideal: 640 },
          height: isAndroid ? { ideal: 720 } : { ideal: 480 },
          frameRate: { ideal: isAndroid ? 24 : 30 }
        },
        audio: false
      };

      // Intentar obtener acceso a la cámara
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

      // Configurar optimizaciones específicas para Android
      if (isAndroid) {
        console.log("CameraView: Aplicando optimizaciones para Android");
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            // Optimizaciones para Android
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

      // Configurar el elemento de video
      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        
        // Optimizaciones específicas para el elemento video en Android
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // En Android, esperar a que las optimizaciones se apliquen antes de reproducir
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : 0));
        
        await videoRef.current.play().catch(e => {
          console.error("Error reproduciendo video:", e);
          throw e;
        });
        console.log("CameraView: Video reproduciendo correctamente");
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Esperar un momento antes de activar la linterna en Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 0));

      // Intentar activar la linterna si estamos monitorizando
      if (isMonitoring) {
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
      }

      // Notificar que el stream está listo
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

  // Efecto para iniciar/detener la cámara cuando cambia isMonitoring
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring, "lastState:", lastMonitoringStateRef.current);
    
    // Evitar cambios redundantes
    if (isMonitoring === lastMonitoringStateRef.current) {
      console.log("CameraView: Estado de monitorización no cambió realmente, ignorando");
      return;
    }
    
    lastMonitoringStateRef.current = isMonitoring;
    
    if (isMonitoring) {
      // Usar un timeout más largo para Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 500 : 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Efecto de limpieza al montar/desmontar el componente
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Componente montado");

    // Asegurarse de que los permisos de la cámara estén disponibles
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Solo comprobamos los permisos, detenemos el stream inmediatamente
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

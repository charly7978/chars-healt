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
  const retryCountRef = useRef(0);
  const maxRetries = 3;
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
        
        // Detener la pista inmediatamente
        try {
          if (track.readyState === 'live') {
            console.log("CameraView: Deteniendo track de video");
            track.stop();
          }
        } catch (err) {
          console.error("Error deteniendo track:", err);
        }
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
    
    // Resetear el contador de reintentos
    retryCountRef.current = 0;
  }, []);

  // Función para iniciar la cámara
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
      // Asegurarse de que cualquier stream previo está detenido
      stopCamera();
      
      // Esperar un momento para que los recursos se liberen (especialmente en Android)
      await new Promise(resolve => setTimeout(resolve, 300));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Usar configuraciones más simples para mejor compatibilidad
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 } // Reducir para mejor estabilidad
        },
        audio: false
      };

      // En Android, primero intentar con configuraciones más simples
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

      // Configurar el elemento de video con prioridad
      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        videoRef.current.srcObject = mediaStream;
        
        try {
          // Reproducir sin esperar
          videoRef.current.play();
          console.log("CameraView: Video reproduciendo correctamente");
          
          // Esperar a que la reproducción comience realmente
          await new Promise<void>((resolve, reject) => {
            if (videoRef.current) {
              const onPlaying = () => {
                videoRef.current?.removeEventListener('playing', onPlaying);
                resolve();
              };
              
              const onError = (e: any) => {
                videoRef.current?.removeEventListener('error', onError);
                reject(e);
              };
              
              videoRef.current.addEventListener('playing', onPlaying);
              videoRef.current.addEventListener('error', onError);
              
              // Timeout por si acaso
              setTimeout(() => resolve(), 2000);
            } else {
              resolve();
            }
          });
          
        } catch (e) {
          console.error("Error reproduciendo video:", e);
        }
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Esperar antes de activar la linterna
      await new Promise(resolve => setTimeout(resolve, 500));

      // Solo activar la linterna si todo lo demás ha funcionado correctamente
      if (isMonitoring && streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
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
      if (onStreamReady && isMonitoring && streamRef.current) {
        console.log("CameraView: Notificando stream listo");
        onStreamReady(streamRef.current);
      }
    } catch (error) {
      console.error('Error iniciando la cámara:', error);
      setError(`Error iniciando la cámara: ${error instanceof Error ? error.message : String(error)}`);
      
      // Intentar de nuevo con configuraciones aún más simples si estamos en Android
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`CameraView: Reintentando (${retryCountRef.current}/${maxRetries})...`);
        setTimeout(() => {
          initializingRef.current = false;
          startCamera();
        }, 1000);
      } else {
        stopCamera();
      }
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid]);

  // Efecto para iniciar/detener la cámara cuando cambia isMonitoring
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      // Esperar un poco antes de iniciar la cámara
      const timeoutId = setTimeout(() => {
        startCamera();
      }, 1000);
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
    <div className="relative w-full h-full">
      {error && (
        <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <p className="text-red-600 font-bold">Error de cámara</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover ${isFingerDetected ? 'opacity-100' : 'opacity-80'}`}
        playsInline
        muted
        style={{
          display: isMonitoring ? 'block' : 'none',
          zIndex: 10
        }}
      />
    </div>
  );
};

export default React.memo(CameraView);

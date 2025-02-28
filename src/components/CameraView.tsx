
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
  const [error, setError] = useState<string | null>(null);

  // Función para detener la cámara y liberar recursos
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // Desactivar la linterna si está disponible
        if (track.getCapabilities()?.torch) {
          try {
            track.applyConstraints({
              advanced: [{ torch: false }]
            }).catch(err => console.error("Error desactivando linterna:", err));
          } catch (err) {
            console.error("Error desactivando linterna:", err);
          }
        }
        
        // Detener la pista
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
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error limpiando video element:", err);
      }
    }
  }, []);

  // Función para iniciar la cámara
  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: No iniciando cámara porque isMonitoring es false");
      return;
    }
    
    console.log("CameraView: Iniciando cámara");
    setError(null);
    
    try {
      // Asegurarse de que cualquier stream previo está detenido
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Configuración de la cámara optimizada para dispositivos móviles
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
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
        return;
      }

      streamRef.current = mediaStream;

      // Configurar el elemento de video
      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(e => {
          console.error("Error reproduciendo video:", e);
          throw e;
        });
        console.log("CameraView: Video reproduciendo correctamente");
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Intentar activar la linterna si estamos monitorizando
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

      // Notificar que el stream está listo
      if (onStreamReady && isMonitoring) {
        console.log("CameraView: Notificando stream listo");
        onStreamReady(mediaStream);
      }
    } catch (error) {
      console.error('Error iniciando la cámara:', error);
      setError(`Error iniciando la cámara: ${error instanceof Error ? error.message : String(error)}`);
      stopCamera();
    }
  }, [isMonitoring, onStreamReady, stopCamera]);

  // Efecto para iniciar/detener la cámara cuando cambia isMonitoring
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      // Usar un pequeño timeout para evitar problemas con múltiples inicializaciones
      const timeoutId = setTimeout(() => {
        startCamera();
      }, 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera]);

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
          backfaceVisibility: 'hidden'
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

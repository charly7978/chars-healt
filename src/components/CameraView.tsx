
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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mountedRef = useRef(true);

  // Función para detener la cámara y liberar recursos
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        // Desactivar la linterna si está disponible
        if (track.getCapabilities()?.torch) {
          try {
            track.applyConstraints({
              advanced: [{ torch: false }]
            });
          } catch (err) {
            console.error("Error desactivando linterna:", err);
          }
        }
        
        // Detener la pista
        if (track.readyState === 'live') {
          console.log("CameraView: Deteniendo track de video");
          track.stop();
        }
      });
    }

    // Limpiar el video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setStream(null);
  }, [stream]);

  // Función para iniciar la cámara
  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: No iniciando cámara porque isMonitoring es false");
      return;
    }
    
    console.log("CameraView: Iniciando cámara");
    
    try {
      // Si ya hay un stream activo, no hacer nada
      if (stream && stream.active) {
        console.log("CameraView: La cámara ya está activa");
        return;
      }

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

      // Obtener acceso a la cámara
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Componente desmontado o no monitorizando, liberando stream");
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }

      setStream(mediaStream);

      // Configurar el elemento de video
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(e => {
          console.error("Error reproduciendo video:", e);
        });
      }

      // Intentar activar la linterna si estamos monitorizando
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack && videoTrack.getCapabilities()?.torch) {
        try {
          await videoTrack.applyConstraints({
            advanced: [{ torch: isMonitoring }]
          });
        } catch (e) {
          console.error("Error configurando linterna:", e);
        }
      }

      // Notificar que el stream está listo
      if (onStreamReady && isMonitoring) {
        onStreamReady(mediaStream);
      }
    } catch (error) {
      console.error('Error iniciando la cámara:', error);
      stopCamera();
    }
  }, [isMonitoring, onStreamReady, stopCamera, stream]);

  // Efecto para iniciar/detener la cámara cuando cambia isMonitoring
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera]);

  // Efecto de limpieza al montar/desmontar el componente
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Componente montado");

    return () => {
      console.log("CameraView: Componente desmontando");
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  return (
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
  );
};

export default React.memo(CameraView);


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
  const streamRequestRef = useRef<ReturnType<typeof requestAnimationFrame>>();

  const stopCamera = useCallback(async () => {
    if (streamRequestRef.current) {
      cancelAnimationFrame(streamRequestRef.current);
      streamRequestRef.current = undefined;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /android/i.test(navigator.userAgent);
      
      // Optimizar configuración de video
      const videoConstraints: MediaTrackConstraints = {
        facingMode: 'environment',
        width: { ideal: 640 }, // Reducido de 720
        height: { ideal: 480 },
        frameRate: { ideal: 25, max: 30 } // Optimizado para mejor rendimiento
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false // Explícitamente deshabilitar audio
      });

      const videoTrack = stream.getVideoTracks()[0];

      // Aplicar optimizaciones específicas para Android
      if (videoTrack && isAndroid) {
        try {
          await videoTrack.applyConstraints({
            advanced: [
              { exposureMode: 'continuous' },
              { focusMode: 'continuous' },
              { whiteBalanceMode: 'continuous' }
            ]
          }).catch(() => {
            // Ignorar errores de constraints no soportados
          });
        } catch (err) {
          console.log("Algunas optimizaciones no están disponibles");
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.style.transform = 'translateZ(0)';
        // Habilitar aceleración por hardware
        videoRef.current.style.willChange = 'transform';
        videoRef.current.style.backfaceVisibility = 'hidden';
      }

      setStream(stream);
      
      if (onStreamReady) {
        onStreamReady(stream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
    }
  }, [onStreamReady]);

  useEffect(() => {
    if (isMonitoring && !stream) {
      startCamera();
    } else if (!isMonitoring && stream) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, stream, startCamera, stopCamera]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        imageRendering: 'optimizeSpeed'
      }}
    />
  );
};

export default React.memo(CameraView);

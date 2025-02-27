
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
  const [error, setError] = useState<string | null>(null);
  const streamRequestRef = useRef<ReturnType<typeof requestAnimationFrame>>();

  const stopCamera = useCallback(async () => {
    try {
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
    } catch (err) {
      console.error('Error al detener la cámara:', err);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      await stopCamera(); // Aseguramos que no haya streams activos

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado en este navegador");
      }

      console.log('Solicitando acceso a la cámara...');

      // Intentar primero con la cámara trasera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        console.log('Stream obtenido con cámara trasera');
        handleStreamSuccess(stream);
      } catch (err) {
        console.log('Fallback a cualquier cámara disponible:', err);
        // Si falla, intentar con cualquier cámara disponible
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        
        handleStreamSuccess(stream);
      }

    } catch (err) {
      console.error('Error al iniciar la cámara:', err);
      setError(err instanceof Error ? err.message : 'Error al acceder a la cámara');
    }
  }, [onStreamReady]);

  const handleStreamSuccess = async (stream: MediaStream) => {
    const videoTrack = stream.getVideoTracks()[0];
    console.log('Cámara activada:', videoTrack.label);

    try {
      // Intentar aplicar configuraciones avanzadas
      if (videoTrack.getCapabilities) {
        const capabilities = videoTrack.getCapabilities();
        console.log('Capacidades de la cámara:', capabilities);

        if (capabilities) {
          const constraints: MediaTrackConstraints = {
            advanced: []
          };

          if ('exposureMode' in capabilities) {
            constraints.advanced?.push({ exposureMode: 'continuous' });
          }
          if ('focusMode' in capabilities) {
            constraints.advanced?.push({ focusMode: 'continuous' });
          }
          if ('whiteBalanceMode' in capabilities) {
            constraints.advanced?.push({ whiteBalanceMode: 'continuous' });
          }

          if (constraints.advanced?.length > 0) {
            await videoTrack.applyConstraints(constraints);
          }
        }
      }
    } catch (err) {
      console.log('Algunas configuraciones avanzadas no están disponibles:', err);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    setStream(stream);
    setError(null);
    
    if (onStreamReady) {
      onStreamReady(stream);
    }
  };

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

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black text-white text-center p-4">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
    />
  );
};

export default React.memo(CameraView);

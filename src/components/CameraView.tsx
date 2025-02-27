
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
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    console.log('Deteniendo cámara...');
    try {
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          try {
            if (track.readyState === 'live') {
              track.stop();
            }
          } catch (e) {
            console.warn('Error al detener track:', e);
          }
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      streamRef.current = null;
    } catch (err) {
      console.error('Error al detener la cámara:', err);
    }
  }, []);

  const setupCameraOptimizations = useCallback(async (videoTrack: MediaStreamTrack) => {
    try {
      console.log('Configurando optimizaciones de cámara...');
      const capabilities = videoTrack.getCapabilities();
      console.log('Capacidades de la cámara:', capabilities);

      const constraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };

      if (capabilities.exposureMode?.includes('manual')) {
        constraints.exposureMode = 'manual';
      }

      if (capabilities.whiteBalanceMode?.includes('manual')) {
        constraints.whiteBalanceMode = 'manual';
      }

      if (capabilities.focusMode?.includes('manual')) {
        constraints.focusMode = 'manual';
      }

      await videoTrack.applyConstraints(constraints);
      console.log('Optimizaciones aplicadas:', constraints);

      // Intentar activar la linterna si está disponible
      if (capabilities.torch) {
        try {
          await videoTrack.applyConstraints({
            advanced: [{ torch: true }]
          });
          console.log('Linterna activada');
        } catch (e) {
          console.warn('No se pudo activar la linterna:', e);
        }
      }
    } catch (err) {
      console.warn('Error al aplicar optimizaciones:', err);
    }
  }, []);

  const startCamera = useCallback(async () => {
    console.log('Iniciando cámara...');
    try {
      // Limpiar cualquier stream anterior
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia no está soportado en este navegador');
      }

      // Primero intentar con la cámara trasera
      let newStream: MediaStream;
      try {
        console.log('Intentando acceder a la cámara trasera...');
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
        console.log('Cámara trasera obtenida exitosamente');
      } catch (backError) {
        console.log('Error con cámara trasera, intentando con cámara frontal:', backError);
        // Si falla, intentar con la cámara frontal
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
        console.log('Cámara frontal obtenida exitosamente');
      }

      const videoTrack = newStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No se pudo obtener el video track');
      }

      console.log('Video track obtenido:', videoTrack.label);

      // Asignar el stream al video element antes de las optimizaciones
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => resolve();
          } else {
            resolve();
          }
        });
        await videoRef.current.play();
      }

      await setupCameraOptimizations(videoTrack);
      
      streamRef.current = newStream;
      setError(null);

      if (onStreamReady) {
        onStreamReady(newStream);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al iniciar la cámara';
      console.error('Error de inicialización de cámara:', err);
      setError(errorMessage);
      stopCamera();
    }
  }, [onStreamReady, stopCamera, setupCameraOptimizations]);

  useEffect(() => {
    let isMounted = true;

    const handleCameraState = async () => {
      if (isMonitoring && !streamRef.current && isMounted) {
        await startCamera();
      } else if (!isMonitoring && streamRef.current && isMounted) {
        stopCamera();
      }
    };

    handleCameraState();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isMonitoring, startCamera, stopCamera]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black text-white text-center p-4">
        <p>{error}</p>
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

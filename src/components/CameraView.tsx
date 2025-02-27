
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

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
    }
  }, [stream]);

  const setupVideoTrack = useCallback(async (videoTrack: MediaStreamTrack) => {
    try {
      // Intentamos optimizar la cámara para la medición de SPO2
      if ('getCapabilities' in videoTrack) {
        const capabilities = videoTrack.getCapabilities();
        const settings: MediaTrackConstraints = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        };

        // Configuraciones específicas para medición SPO2
        if (capabilities) {
          if (capabilities.exposureMode) {
            settings.exposureMode = 'manual';
            settings.exposureTime = 33000; // 1/30 segundo
          }
          if (capabilities.whiteBalanceMode) {
            settings.whiteBalanceMode = 'manual';
          }
          if (capabilities.focusMode) {
            settings.focusMode = 'manual';
            settings.focusDistance = 100; // Enfoque cercano
          }
        }

        await videoTrack.applyConstraints(settings);
      }

      // Activar la linterna si está disponible
      if ('torch' in videoTrack.getCapabilities()) {
        await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
      }
    } catch (err) {
      console.warn('No se pudieron aplicar todas las optimizaciones:', err);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia no está soportado');
      }

      // Primero intentamos con la cámara trasera
      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
      } catch (backError) {
        console.log('Intentando con cámara frontal:', backError);
        // Si falla, intentamos con la cámara frontal
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
      }

      const videoTrack = newStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No se pudo obtener el video track');
      }

      await setupVideoTrack(videoTrack);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(console.error);
          }
        };
      }

      setStream(newStream);
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
  }, [onStreamReady, stopCamera, setupVideoTrack]);

  useEffect(() => {
    let mounted = true;

    if (isMonitoring && !stream && mounted) {
      startCamera();
    }

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [isMonitoring, stream, startCamera, stopCamera]);

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

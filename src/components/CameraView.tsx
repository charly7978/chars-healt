
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
    try {
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setStream(null);
      }
    } catch (err) {
      console.error('Error stopping camera:', err);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      // Primero detener cualquier stream existente
      stopCamera();

      // Verificar soporte
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("La cámara no está soportada en este navegador");
      }

      // Intentar obtener la cámara trasera primero
      let cameraStream: MediaStream;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (backCameraError) {
        console.log('Fallback a cámara frontal:', backCameraError);
        // Si falla, intentar con cualquier cámara
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }

      // Verificar que tenemos un track de video
      const videoTrack = cameraStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error("No se pudo obtener el video de la cámara");
      }

      // Configurar el elemento de video
      if (videoRef.current) {
        videoRef.current.srcObject = cameraStream;
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = resolve;
          }
        });
        await videoRef.current.play();
      }

      // Guardar el stream y notificar
      setStream(cameraStream);
      setError(null);
      
      if (onStreamReady) {
        onStreamReady(cameraStream);
      }

    } catch (err) {
      console.error('Camera initialization error:', err);
      setError(err instanceof Error ? err.message : 'Error al iniciar la cámara');
      stopCamera();
    }
  }, [onStreamReady, stopCamera]);

  useEffect(() => {
    let mounted = true;

    const initCamera = async () => {
      if (isMonitoring && !stream && mounted) {
        await startCamera();
      }
    };

    initCamera();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [isMonitoring, stream, startCamera, stopCamera]);

  useEffect(() => {
    if (!isMonitoring) {
      stopCamera();
    }
  }, [isMonitoring, stopCamera]);

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

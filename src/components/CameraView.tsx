
import React, { useRef, useEffect } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      console.log('CÁMARA: Intentando iniciar...');
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          console.error('CÁMARA: getUserMedia no está soportado');
          return;
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });

        console.log('CÁMARA: Stream obtenido exitosamente');
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          console.log('CÁMARA: Video elemento configurado');
        }

        stream = newStream;
        if (onStreamReady) {
          onStreamReady(newStream);
          console.log('CÁMARA: Stream enviado al componente padre');
        }
      } catch (err) {
        console.error('CÁMARA: Error al iniciar =>', err);
      }
    };

    const stopCamera = () => {
      console.log('CÁMARA: Deteniendo...');
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('CÁMARA: Track detenido');
        });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        stream = null;
        console.log('CÁMARA: Detenida completamente');
      }
    };

    if (isMonitoring) {
      console.log('CÁMARA: isMonitoring es true, iniciando...');
      startCamera();
    } else {
      console.log('CÁMARA: isMonitoring es false, deteniendo...');
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, onStreamReady]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{ objectFit: 'cover' }}
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
    />
  );
};

export default CameraView;

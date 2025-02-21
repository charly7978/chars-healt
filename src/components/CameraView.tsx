
import React, { useRef, useEffect } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          alert('Error: La cámara no está disponible en este dispositivo');
          return;
        }

        const constraints = {
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          streamRef.current = newStream;
          
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };

          if (onStreamReady) {
            onStreamReady(newStream);
          }
        }
      } catch (err) {
        alert('Error al acceder a la cámara. Por favor, permite el acceso.');
        console.error('Error de cámara:', err);
      }
    };

    const stopCamera = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (isMonitoring) {
      startCamera();
    } else {
      stopCamera();
    }

    // Cleanup al desmontar
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
      style={{ 
        objectFit: 'cover',
        transform: 'scaleX(-1)' // Espejo para cámara frontal
      }}
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
    />
  );
};

export default CameraView;

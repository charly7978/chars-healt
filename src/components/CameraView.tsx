
import React, { useRef, useEffect } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const setupCamera = async () => {
      if (isMonitoring && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment', // Usar cámara trasera
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });

          streamRef.current = stream;
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }

          // Activar la linterna si está disponible
          const track = stream.getVideoTracks()[0];
          if (track?.getCapabilities?.().torch) {
            await track.applyConstraints({
              advanced: [{ torch: true }]
            });
          }

          if (onStreamReady) {
            onStreamReady(stream);
          }

          // Configurar el temporizador de 20 segundos
          timeoutId = setTimeout(() => {
            stopCamera();
          }, 20000); // 20 segundos

        } catch (err) {
          console.error("Error accessing camera:", err);
        }
      } else {
        stopCamera();
      }
    };

    const stopCamera = async () => {
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        
        // Desactivar la linterna y detener la cámara
        for (const track of tracks) {
          if (track.getCapabilities?.().torch) {
            await track.applyConstraints({
              advanced: [{ torch: false }]
            });
          }
          track.stop();
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        streamRef.current = null;
      }
    };

    setupCamera();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      stopCamera();
    };
  }, [isMonitoring, onStreamReady]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto object-cover z-0"
    />
  );
};

export default CameraView;

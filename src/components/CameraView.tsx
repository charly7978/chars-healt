
import React, { useRef, useEffect } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const setupCamera = async () => {
      // Si ya hay un stream activo y estamos monitoreando, no hacer nada
      if (streamRef.current && isMonitoring) {
        return;
      }

      // Si hay un stream activo pero no estamos monitoreando, detener la cámara
      if (streamRef.current && !isMonitoring) {
        await stopCamera();
        return;
      }

      // Si no hay stream y estamos monitoreando, iniciar la cámara
      if (!streamRef.current && isMonitoring && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
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
          const capabilities = track.getCapabilities();
          
          if (capabilities && 'torch' in capabilities) {
            try {
              await track.applyConstraints({
                advanced: [{ torch: true } as MediaTrackConstraintSet]
              });
            } catch (err) {
              console.error("Error activating torch:", err);
            }
          }

          if (onStreamReady) {
            onStreamReady(stream);
          }

        } catch (err) {
          console.error("Error accessing camera:", err);
        }
      }
    };

    const stopCamera = async () => {
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        
        for (const track of tracks) {
          const capabilities = track.getCapabilities();
          
          if (capabilities && 'torch' in capabilities) {
            try {
              await track.applyConstraints({
                advanced: [{ torch: false } as MediaTrackConstraintSet]
              });
            } catch (err) {
              console.error("Error deactivating torch:", err);
            }
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

    // Cleanup function
    return () => {
      stopCamera();
    };
  }, [isMonitoring, onStreamReady]); // Solo se ejecuta cuando cambia isMonitoring u onStreamReady

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

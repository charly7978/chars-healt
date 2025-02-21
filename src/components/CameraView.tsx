
import React, { useRef, useEffect, useState } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      if (streamRef.current) {
        console.log('Cámara ya iniciada, evitando reinicio');
        return;
      }

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          console.error('getUserMedia no disponible');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        if (videoRef.current && !streamRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play()
                .then(() => {
                  setIsInitialized(true);
                  if (onStreamReady) {
                    onStreamReady(stream);
                  }
                })
                .catch(console.error);
            }
          };
        }
      } catch (err) {
        console.error('Error al iniciar la cámara:', err);
      }
    };

    const stopCamera = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        streamRef.current = null;
        setIsInitialized(false);
      }
    };

    if (isMonitoring && !isInitialized) {
      startCamera();
    } else if (!isMonitoring && isInitialized) {
      stopCamera();
    }

    return () => {
      if (streamRef.current) {
        stopCamera();
      }
    };
  }, [isMonitoring, onStreamReady, isInitialized]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{ 
        objectFit: 'cover',
        transform: 'scaleX(-1)',
        opacity: isInitialized ? 1 : 0,
        transition: 'opacity 0.3s ease-in-out'
      }}
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
    />
  );
};

export default CameraView;

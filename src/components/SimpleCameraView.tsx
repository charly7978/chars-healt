
import React, { useRef, useEffect } from 'react';
import { Fingerprint } from 'lucide-react';

interface SimpleCameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const SimpleCameraView = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}: SimpleCameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia no está soportado");
        }

        // Configuración simple y directa
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          if (onStreamReady) {
            onStreamReady(stream);
          }

          // Intentar activar la linterna después de que el video esté listo
          videoRef.current.onloadedmetadata = async () => {
            try {
              const track = stream?.getVideoTracks()[0];
              if (track?.getCapabilities()?.torch) {
                await track.applyConstraints({
                  advanced: [{ torch: true }]
                });
              }
            } catch (err) {
              console.log("No se pudo activar la linterna:", err);
            }
          };
        }
      } catch (err) {
        console.error("Error al iniciar la cámara:", err);
      }
    };

    const stopCamera = () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (isMonitoring) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, onStreamReady]);

  const getFingerColor = () => {
    if (!isFingerDetected) return 'text-gray-400';
    if (signalQuality > 75) return 'text-green-500';
    if (signalQuality > 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ 
          objectFit: 'cover',
          transform: 'scaleX(-1)'
        }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      {isMonitoring && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center">
          <Fingerprint
            size={48}
            className={`transition-colors duration-300 ${getFingerColor()}`}
          />
          <span className={`text-xs mt-2 transition-colors duration-300 ${
            isFingerDetected ? 'text-green-500' : 'text-gray-400'
          }`}>
            {isFingerDetected ? "dedo detectado" : "ubique su dedo en el lente"}
          </span>
        </div>
      )}
    </>
  );
};

export default SimpleCameraView;


import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
  buttonPosition?: DOMRect;
}

const CameraView = ({ 
  onStreamReady, 
  isMonitoring, 
  isFingerDetected = false, 
  signalQuality = 0,
  buttonPosition 
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const stopCamera = async () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      // Ajustamos los constraints para mejor calidad de señal PPG
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280, min: 720 },
          height: { ideal: 720, min: 480 },
          frameRate: { min: 25, ideal: 30 },
          aspectRatio: { ideal: 16/9 },
          // Ajustamos la exposición y el balance de blancos para mejor calidad
          whiteBalanceMode: 'continuous',
          exposureMode: 'continuous',
          // Establecemos prioridad en la exposición para mejor detección de cambios de color
          exposureCompensation: 0,
          exposurePriority: 'continuous'
        } as MediaTrackConstraints
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Configuramos el track de video con los parámetros que soporta el estándar
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            advanced: [{
              exposureMode: 'continuous',
              whiteBalanceMode: 'continuous'
            }]
          });
        } catch (err) {
          console.log("No se pudieron aplicar configuraciones avanzadas:", err);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      setStream(newStream);
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
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
  }, [isMonitoring]);

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
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
      />
      {isMonitoring && buttonPosition && (
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

export default CameraView;

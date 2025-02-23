
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
      stream.getTracks().forEach(track => {
        track.stop();
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      });
      setStream(null);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /android/i.test(navigator.userAgent);

      // Configuración específica para Android
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 720 },
          height: { ideal: 480 },
          // Optimizaciones específicas para Android
          ...(isAndroid && {
            frameRate: { ideal: 25 }, // Reducido de 30 a 25 para Android
            resizeMode: 'crop-and-scale' // Modo eficiente de redimensionamiento
          })
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = newStream.getVideoTracks()[0];

      if (videoTrack) {
        if (isAndroid) {
          // Optimizaciones específicas para Android
          await videoTrack.applyConstraints({
            advanced: [
              { exposureMode: "continuous" },
              { focusMode: "continuous" },
              { whiteBalanceMode: "continuous" }
            ]
          }).catch(err => console.log("No se pudieron aplicar optimizaciones:", err));

          // Reducir la sobrecarga del pipeline de video
          if (videoRef.current) {
            videoRef.current.style.transform = 'translateZ(0)';
            videoRef.current.style.backfaceVisibility = 'hidden';
          }
        }

        const capabilities = videoTrack.getCapabilities();
        console.log('Camera capabilities:', capabilities);

        try {
          const settings = videoTrack.getSettings();
          console.log('Current camera settings:', settings);
        } catch (err) {
          console.log("No se pudo obtener la configuración actual:", err);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        if (isAndroid) {
          // Optimizaciones de rendering para Android
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
        }
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

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden'
        }}
      />
      {isMonitoring && buttonPosition && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center">
          <Fingerprint
            size={48}
            className={`transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              signalQuality > 75 ? 'text-green-500' :
              signalQuality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
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

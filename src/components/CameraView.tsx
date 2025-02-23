
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

      const isAndroid = /android/i.test(navigator.userAgent);

      // Inicialmente pedimos configuración mínima para abrir rápido
      const initialConstraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: 720,
          height: 480
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(initialConstraints);
      
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        if (isAndroid) {
          try {
            // Una vez que la cámara está abierta, ajustamos la calidad
            setTimeout(async () => {
              try {
                await videoTrack.applyConstraints({
                  width: { max: 1280 },
                  height: { max: 720 },
                  frameRate: { min: 25, ideal: 30 },
                  aspectRatio: { ideal: 16/9 }
                });
              } catch (err) {
                console.log("No se pudieron aplicar configuraciones optimizadas:", err);
              }
            }, 500);

            videoTrack.enabled = true;
            videoRef.current?.addEventListener('pause', () => {
              videoTrack.enabled = false;
            });
            videoRef.current?.addEventListener('play', () => {
              videoTrack.enabled = true;
            });
          } catch (err) {
            console.log("No se pudieron aplicar optimizaciones para Android:", err);
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
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
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
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)'
        }}
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

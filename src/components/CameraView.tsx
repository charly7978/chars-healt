
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = async () => {
    try {
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          if (track.readyState === 'live') {
            if (track.getCapabilities()?.torch) {
              track.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(console.error);
            }
            track.stop();
          }
        });
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      streamRef.current = null;
      setStream(null);
    } catch (err) {
      console.error("Error al detener la cámara:", err);
    }
  };

  const startCamera = async () => {
    try {
      await stopCamera(); // Asegurarnos de limpiar cualquier stream anterior

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /Android/i.test(navigator.userAgent);
      
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 },
          ...(isAndroid && {
            resizeMode: 'crop-and-scale'
          })
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!videoRef.current) return;
      
      videoRef.current.srcObject = newStream;
      streamRef.current = newStream;
      
      // Esperar a que el video esté listo
      await new Promise((resolve) => {
        if (videoRef.current) {
          videoRef.current.onloadedmetadata = resolve;
        }
      });

      const videoTrack = newStream.getVideoTracks()[0];
      
      // Intentar activar la linterna después de un pequeño retraso
      setTimeout(async () => {
        try {
          if (videoTrack.getCapabilities()?.torch) {
            await videoTrack.applyConstraints({
              advanced: [{ torch: true }]
            });
          }
        } catch (err) {
          console.log("No se pudo activar la linterna:", err);
        }
      }, 500);

      setStream(newStream);
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
      // Intentar sin modo environment si falla
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          streamRef.current = fallbackStream;
          setStream(fallbackStream);
          if (onStreamReady) {
            onStreamReady(fallbackStream);
          }
        }
      } catch (fallbackErr) {
        console.error("Error en fallback de cámara:", fallbackErr);
      }
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
        style={{ 
          objectFit: 'cover',
          transform: 'scaleX(-1)' // Invertir horizontalmente para espejo
        }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="hidden"
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

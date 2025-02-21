import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isFingerDetected, setIsFingerDetected] = useState(false);

  const detectFinger = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Capturar imagen del video
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    const data = imageData.data;
    
    let validPixels = 0;
    const totalPixels = data.length / 4;

    // Analizar cada pixel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Un pixel es válido si:
      // 1. Es muy oscuro (cerca del negro)
      // 2. O es rojo intenso con muy poco verde y azul
      // Ajuste sutil: bajamos el umbral del rojo de 150 a 140 y aumentamos ligeramente la tolerancia para verde y azul
      if (
        (r < 30 && g < 30 && b < 30) || // Negro/muy oscuro
        (r > 140 && g < 35 && b < 35)    // Rojo intenso (umbral más sensible)
      ) {
        validPixels++;
      }
    }

    // Calcular el porcentaje de cobertura
    const coverage = (validPixels / totalPixels) * 100;
    
    // La detección es positiva solo si más del 95% de los píxeles son válidos
    setIsFingerDetected(coverage > 95);
  };

  const stopCamera = async () => {
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        if (track.getCapabilities()?.torch) {
          track.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
        track.stop();
      });
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

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      const videoTrack = newStream.getVideoTracks()[0];
      
      if (videoTrack.getCapabilities()?.torch) {
        await videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        });
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

  useEffect(() => {
    if (!stream || !isMonitoring) return;

    const interval = setInterval(detectFinger, 200);
    return () => clearInterval(interval);
  }, [stream, isMonitoring]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ objectFit: 'cover' }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="hidden"
      />
      {isMonitoring && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <Fingerprint
            size={64}
            className={`transition-colors duration-300 ${
              isFingerDetected ? 'text-green-500' : 'text-gray-400'
            }`}
          />
        </div>
      )}
    </>
  );
};

export default CameraView;


import React, { useRef, useEffect, useState } from 'react';

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
    if (!videoRef.current || !canvasRef.current) return false;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    // Dibujamos el frame actual del video en el canvas
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Obtenemos los datos de la imagen
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    const data = imageData.data;
    
    let redPixels = 0;
    let totalPixels = data.length / 4;
    let darkPixels = 0;
    
    // Analizamos cada píxel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Criterio 1: Detectar píxeles predominantemente rojos
      if (r > 150 && r > g * 1.5 && r > b * 1.5) {
        redPixels++;
      }
      
      // Criterio 2: Detectar píxeles oscuros (figura apoyada en el lente)
      const brightness = (r + g + b) / 3;
      if (brightness < 60) {
        darkPixels++;
      }
    }
    
    // Calculamos porcentajes
    const redPercentage = (redPixels / totalPixels) * 100;
    const darkPercentage = (darkPixels / totalPixels) * 100;
    
    // Si hay suficientes píxeles rojos o oscuros, consideramos que hay un dedo
    const fingerDetected = redPercentage > 15 || darkPercentage > 30;
    
    setIsFingerDetected(fingerDetected);
    
    // Enviamos el evento de detección
    if (fingerDetected) {
      window.dispatchEvent(new CustomEvent('fingerDetected', { detail: { redPercentage, darkPercentage } }));
    }

    return fingerDetected;
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
      
      // Intentar activar la linterna
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

  // Efecto para el análisis continuo de detección de dedo
  useEffect(() => {
    if (!stream || !isMonitoring) return;

    const analyzeInterval = setInterval(() => {
      detectFinger();
    }, 500); // Analizar cada 500ms

    return () => {
      clearInterval(analyzeInterval);
    };
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
        className="hidden" // Canvas oculto usado solo para análisis
      />
      {isMonitoring && !isFingerDetected && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/50 p-4 rounded-lg z-20">
          <p className="text-white text-center">Coloque su dedo sobre la cámara</p>
        </div>
      )}
    </>
  );
};

export default CameraView;

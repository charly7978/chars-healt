import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera } from 'lucide-react';

interface CameraViewProps {
  isMonitoring: boolean;
  onStreamReady?: (stream: MediaStream) => void;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView: React.FC<CameraViewProps> = ({
  isMonitoring,
  onStreamReady,
  isFingerDetected = false,
  signalQuality = 0
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const startCamera = useCallback(async () => {
    if (!isMonitoring) return;

    setIsLoading(true);
    setError(null);

    try {
      // Detener cualquier stream anterior
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const constraints = {
        video: {
          facingMode: 'environment', // Usar cámara trasera
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };

      console.log("CameraView: Solicitando acceso a la cámara...");
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("CameraView: Acceso a la cámara concedido");
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => {
          console.error("Error al iniciar reproducción de video:", e);
          setError("No se pudo reproducir el video");
        });
      }

      // Notificar al padre que la cámara está lista
      if (onStreamReady) {
        onStreamReady(stream);
      }
    } catch (err) {
      console.error("Error al acceder a la cámara:", err);
      setError(err instanceof Error ? err.message : "Error al acceder a la cámara");
    } finally {
      setIsLoading(false);
    }
  }, [isMonitoring, onStreamReady]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    console.log("CameraView: Cámara detenida");
  }, []);

  // Iniciar/detener cámara cuando isMonitoring cambia
  useEffect(() => {
    if (isMonitoring) {
      startCamera();
    } else {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isMonitoring, startCamera, stopCamera]);

  return (
    <div className="relative w-full h-full">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted
        className={`w-full h-full object-cover transition-opacity duration-500 ${isMonitoring ? 'opacity-100' : 'opacity-0'}`}
        style={{
          transform: 'rotateY(0deg)', // Sin inversión horizontal
          display: isMonitoring ? 'block' : 'none',
        }}
      />
      
      {!isMonitoring && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Camera className="w-16 h-16 text-gray-400" />
        </div>
      )}
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 text-white p-4 text-center">
          <div>
            <h3 className="text-xl font-bold mb-2">Error de cámara</h3>
            <p>{error}</p>
            <button 
              onClick={startCamera}
              className="mt-4 bg-white text-red-900 py-2 px-4 rounded font-bold"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
      
      {isFingerDetected && (
        <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded-full text-xs">
          {signalQuality > 70 ? '✅ Señal óptima' : 
           signalQuality > 50 ? '⚠️ Señal aceptable' : 
           '⚠️ Señal débil'}
        </div>
      )}
    </div>
  );
};

export default CameraView;

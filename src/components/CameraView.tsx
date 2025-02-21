
import React, { useRef, useEffect, useState } from 'react';
import { toast } from "@/components/ui/use-toast";

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

const CameraView = ({ onStreamReady, isMonitoring }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializationAttempts = useRef(0);

  const startCamera = async () => {
    try {
      if (initializationAttempts.current > 3) {
        toast({
          title: "Error de cámara",
          description: "No se pudo iniciar la cámara después de varios intentos. Por favor, recarga la página.",
          variant: "destructive"
        });
        return;
      }

      initializationAttempts.current += 1;

      // Limpiar stream anterior si existe
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      await videoRef.current.play();
      setIsInitialized(true);
      
      if (onStreamReady) {
        onStreamReady(stream);
      }

      initializationAttempts.current = 0;
    } catch (err) {
      console.error('Error al iniciar la cámara:', err);
      toast({
        title: "Error",
        description: "No se pudo acceder a la cámara. Verifica los permisos.",
        variant: "destructive"
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      streamRef.current = null;
      setIsInitialized(false);
    }
  };

  useEffect(() => {
    if (isMonitoring && !streamRef.current) {
      startCamera();
    } else if (!isMonitoring && streamRef.current) {
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
        style={{ 
          objectFit: 'cover',
          transform: 'scaleX(-1)',
          opacity: isInitialized ? 1 : 0,
          transition: 'opacity 0.3s ease-in-out'
        }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      {isMonitoring && !isInitialized && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-white">Iniciando cámara...</div>
        </div>
      )}
    </>
  );
};

export default CameraView;

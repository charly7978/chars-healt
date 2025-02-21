
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
      console.log('Intentando iniciar cámara...');
      
      // Si hay un stream previo, limpiarlo primero
      if (streamRef.current) {
        console.log('Limpiando stream previo...');
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      try {
        console.log('Solicitando permisos de cámara...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        console.log('Permisos concedidos, configurando video...');
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          
          videoRef.current.onloadedmetadata = () => {
            console.log('Metadata cargada, iniciando reproducción...');
            if (videoRef.current) {
              videoRef.current.play()
                .then(() => {
                  console.log('Reproducción iniciada con éxito');
                  setIsInitialized(true);
                  if (onStreamReady) {
                    onStreamReady(stream);
                  }
                })
                .catch(error => {
                  console.error('Error al iniciar reproducción:', error);
                  // Intentar limpiar y reiniciar
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => {
                      track.stop();
                    });
                    streamRef.current = null;
                  }
                  setIsInitialized(false);
                });
            }
          };
        }
      } catch (err) {
        console.error('Error al conectar con la cámara:', err);
        // Asegurar limpieza en caso de error
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
          });
          streamRef.current = null;
        }
        setIsInitialized(false);
      }
    };

    const stopCamera = () => {
      console.log('Deteniendo cámara...');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          console.log('Deteniendo track:', track.kind);
          track.stop();
        });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        streamRef.current = null;
        setIsInitialized(false);
      }
    };

    if (isMonitoring && !streamRef.current) {
      startCamera();
    } else if (!isMonitoring && streamRef.current) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, onStreamReady]);

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

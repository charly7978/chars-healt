import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView = ({ 
  onStreamReady, 
  isMonitoring, 
  isFingerDetected = false, 
  signalQuality = 0,
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const stopCamera = useCallback(() => {
    if (!mountedRef.current) return;

    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // Asegurarse de apagar la linterna antes de detener
        if (track.getCapabilities()?.torch) {
          track.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
        if (track.readyState === 'live') {
          track.stop();
        }
      });
    }

    if (videoRef.current) {
      const video = videoRef.current;
      if (video.srcObject) {
        video.srcObject = null;
      }
      video.load();
    }

    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      if (streamRef.current?.active) {
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara no está disponible');
      }

      // Configuración optimizada para captura de rojo
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920 }, // Aumentada resolución
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            // Configuraciones avanzadas para mejorar la captura de rojo
            advanced: [{
              exposureMode: 'manual',
              exposureTime: 1000, // Tiempo de exposición más largo
              whiteBalanceMode: 'manual',
              colorTemperature: 3000, // Temperatura de color más cálida
              brightness: 100,
              contrast: 95,
              saturation: 100,
              sharpness: 100,
              focusMode: 'manual',
              focusDistance: 10 // Distancia focal corta para macro
            }]
          },
          audio: false
        });
      } catch (err) {
        // Fallback con configuración básica mejorada
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      // Aplicar configuraciones adicionales a los tracks
      stream.getVideoTracks().forEach(track => {
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
          track.applyConstraints({
            advanced: [{ torch: true }]
          }).catch(console.error);
        }

        // Intentar ajustar configuraciones avanzadas si están disponibles
        const settings = {
          exposureMode: 'manual',
          exposureTime: 1000,
          whiteBalanceMode: 'manual',
          colorTemperature: 3000
        };

        track.applyConstraints({ advanced: [settings] })
          .catch(console.error);
      });

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        
        // Ajustes de estilo para mejorar visualización
        video.style.filter = 'saturate(1.2) contrast(1.1)';
        
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            if (mountedRef.current) {
              video.play()
                .then(() => resolve())
                .catch(console.error);
            } else {
              resolve();
            }
          };
        });
      }

      if (mountedRef.current && onStreamReady) {
        onStreamReady(stream);
      }

    } catch (err) {
      console.error('Error al iniciar la cámara:', err);
      stopCamera();
    }
  }, [onStreamReady, stopCamera]);

  useEffect(() => {
    mountedRef.current = true;

    const initializeCamera = async () => {
      if (isMonitoring && !streamRef.current?.active) {
        await startCamera();
      }
    };

    initializeCamera();

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [isMonitoring, startCamera, stopCamera]);

  // Manejar cambios en isMonitoring
  useEffect(() => {
    if (!isMonitoring && streamRef.current) {
      stopCamera();
    }
  }, [isMonitoring, stopCamera]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
      style={{
        filter: 'saturate(1.2) contrast(1.1)', // Mejora la visualización del rojo
        WebkitFilter: 'saturate(1.2) contrast(1.1)' // Para Safari
      }}
    />
  );
};

export default React.memo(CameraView);

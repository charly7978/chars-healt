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
      if (streamRef.current?.active) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara no está disponible');
      }

      let stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // Ajustar solo la exposición para mejorar la visualización del rojo
          advanced: [{
            exposureMode: 'manual',
            exposureTime: 2000, // Tiempo de exposición más bajo para evitar sobreexposición
            exposureCompensation: -1.0 // Reducir la exposición
          }]
        },
        audio: false
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        
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
    />
  );
};

export default React.memo(CameraView);

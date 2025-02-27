
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

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara no está disponible');
      }

      // Intenta primero con la cámara trasera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment'
          },
          audio: false
        });
      } catch (err) {
        // Si falla, intenta con cualquier cámara disponible
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      
      // Aplicar configuraciones básicas
      try {
        await videoTrack.applyConstraints({
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        });
      } catch (err) {
        console.warn('No se pudieron aplicar las configuraciones ideales');
      }

      // Configurar el video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      streamRef.current = stream;

      if (onStreamReady) {
        onStreamReady(stream);
      }

    } catch (err) {
      console.error('Error al iniciar la cámara:', err);
      stopCamera();
    }
  }, [onStreamReady, stopCamera]);

  useEffect(() => {
    if (isMonitoring && !streamRef.current) {
      startCamera();
    } else if (!isMonitoring && streamRef.current) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, startCamera, stopCamera]);

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

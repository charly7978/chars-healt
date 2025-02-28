
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
        // La cámara ya está activa, verificar estado de la linterna
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack && videoTrack.getCapabilities()?.torch) {
          // Activar o desactivar linterna según estado de monitorización
          videoTrack.applyConstraints({
            advanced: [{ torch: isMonitoring }]
          }).catch(err => console.error(`Error ${isMonitoring ? 'activando' : 'desactivando'} linterna:`, err));
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara no está disponible');
      }

      // Intenta obtener la cámara trasera primero
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
      } catch (err) {
        // Si falla, intenta con cualquier cámara disponible
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        
        // Esperar a que el video esté listo antes de reproducirlo
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

      // Gestionar la linterna basado en el estado de monitorización
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: isMonitoring }]
        }).catch(err => console.error(`Error ${isMonitoring ? 'activando' : 'desactivando'} linterna:`, err));
      }

      // Solo notificar si el componente sigue montado
      if (mountedRef.current && onStreamReady) {
        onStreamReady(stream);
      }

    } catch (err) {
      console.error('Error al iniciar la cámara:', err);
      stopCamera();
    }
  }, [isMonitoring, onStreamReady, stopCamera]);

  // Controlar el estado de la linterna cuando cambia isMonitoring
  useEffect(() => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack && videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: isMonitoring }]
        }).catch(err => console.error(`Error ${isMonitoring ? 'activando' : 'desactivando'} linterna:`, err));
      }
    }
  }, [isMonitoring]);

  useEffect(() => {
    mountedRef.current = true;

    const initializeCamera = async () => {
      if (isMonitoring && !streamRef.current?.active) {
        await startCamera();
      } else if (!isMonitoring && streamRef.current) {
        // Si ya no estamos monitoreando, asegurarnos de apagar la linterna
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack && videoTrack.getCapabilities()?.torch) {
          videoTrack.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
      }
    };

    initializeCamera();

    return () => {
      mountedRef.current = false;
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

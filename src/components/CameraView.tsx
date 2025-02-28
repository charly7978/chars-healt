
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
          try {
            track.applyConstraints({
              advanced: [{ torch: false }]
            });
          } catch (err) {
            console.error("Error desactivando linterna:", err);
          }
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
          try {
            await videoTrack.applyConstraints({
              advanced: [{ torch: isMonitoring }]
            });
          } catch (err) {
            console.error(`Error ${isMonitoring ? 'activando' : 'desactivando'} linterna:`, err);
          }
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara no está disponible');
      }

      // Optimización de configuración de la cámara para rendimiento
      const videoConstraints: MediaTrackConstraints = {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },    // Reducido para mejor rendimiento
        height: { ideal: 480 },   // Reducido para mejor rendimiento
        frameRate: { ideal: 30 },
        // Priorizar performance sobre calidad
        aspectRatio: { ideal: 4/3 }
      };

      // Ajuste para Android (donde el hardware puede ser más limitado)
      if (/android/i.test(navigator.userAgent)) {
        Object.assign(videoConstraints, {
          width: { ideal: 480 },  // Aún más pequeño para Android
          height: { ideal: 360 },
          frameRate: { ideal: 25 }
        });
      }

      // Intentar obtener la cámara con estas configuraciones
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });
      } catch (err) {
        // Si falla, intenta con configuración más básica
        console.warn("Fallback a configuración básica de cámara");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 320 },
            height: { ideal: 240 }
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
        
        // Aplicar optimizaciones para mejorar rendimiento de video
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        
        // Aplicar optimizaciones CSS a través de JS para hardware acceleration
        video.style.transform = 'translateZ(0)';
        video.style.backfaceVisibility = 'hidden';
        video.style.willChange = 'transform';
        
        // Configuración para reducir latencia
        try {
          // @ts-ignore - Estas propiedades pueden no estar en los tipos TS pero existen en los navegadores modernos
          if ('mozHasAudio' in video) {
            // @ts-ignore
            video.mozFrameBufferLength = 0;
          }
          // @ts-ignore
          if (typeof video.srcObject !== 'undefined') {
            video.srcObject = stream;
          } else {
            // Fallback para navegadores antiguos
            // @ts-ignore
            video.src = window.URL.createObjectURL(stream);
          }
        } catch (e) {
          video.srcObject = stream;
        }
        
        video.onloadedmetadata = () => {
          if (!mountedRef.current) return;
          
          // Play de video con manejo de promise para navegadores modernos
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn("Error reproduciendo video:", error);
              // En caso de error, intentar reproducir de nuevo con interacción del usuario
              if (document.body) {
                const resumePlayback = () => {
                  video.play().catch(e => console.error("Error en reproducción manual:", e));
                  document.body?.removeEventListener('click', resumePlayback);
                  document.body?.removeEventListener('touchstart', resumePlayback);
                };
                document.body.addEventListener('click', resumePlayback, { once: true, passive: true });
                document.body.addEventListener('touchstart', resumePlayback, { once: true, passive: true });
              }
            });
          }
        };
      }

      // Optimizar configuración del track de video para rendimiento
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          // Aplicar configuraciones avanzadas al track
          const capabilities = videoTrack.getCapabilities();
          const constraints: MediaTrackConstraintSet = {};
          
          // Gestionar la linterna basado en el estado de monitorización
          if (capabilities.torch) {
            constraints.torch = isMonitoring;
          }
          
          // Optimizaciones para cámaras de teléfonos
          if (capabilities.whiteBalanceMode) {
            // @ts-ignore - Algunos navegadores soportan este modo
            constraints.whiteBalanceMode = 'continuous';
          }
          if (capabilities.exposureMode) {
            // @ts-ignore - Algunos navegadores soportan este modo
            constraints.exposureMode = 'continuous';
          }
          
          await videoTrack.applyConstraints({
            advanced: [constraints]
          });
        } catch (err) {
          console.warn("No se pudo aplicar configuraciones avanzadas:", err);
          
          // Intento básico de encender la linterna si todo lo demás falla
          if (isMonitoring) {
            try {
              await videoTrack.applyConstraints({
                advanced: [{ torch: true }]
              });
            } catch (e) {
              console.error("Error básico activando linterna:", e);
            }
          }
        }
      }

      // Notificar que el stream está listo para procesamiento
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
        }).catch(err => {
          console.error(`Error ${isMonitoring ? 'activando' : 'desactivando'} linterna:`, err);
        });
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
          }).catch(err => {
            console.error("Error desactivando linterna:", err);
          });
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
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden'
      }}
    />
  );
};

// Uso de React.memo para evitar renderizados innecesarios
export default React.memo(CameraView);


import React, { useRef, useEffect, useState } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const requestFullscreen = async (element: HTMLElement) => {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen();
      }
    } catch (error) {
      console.error('Error al solicitar pantalla completa:', error);
    }
  };

  const stopCamera = async () => {
    if (stream) {
      const tracks = stream.getTracks();
      for (const track of tracks) {
        track.stop();
        stream.removeTrack(track);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
      setStream(null);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /android/i.test(navigator.userAgent);
      
      // Intentar obtener la resolución más alta disponible
      const displayWidth = window.screen.width * (window.devicePixelRatio || 1);
      const displayHeight = window.screen.height * (window.devicePixelRatio || 1);

      const baseVideoConstraints: MediaTrackConstraints = {
        facingMode: 'environment',
        width: { ideal: Math.max(displayWidth, 1920), min: 720 },
        height: { ideal: Math.max(displayHeight, 1080), min: 480 },
        aspectRatio: { ideal: displayWidth / displayHeight }
      };

      if (isAndroid) {
        Object.assign(baseVideoConstraints, {
          frameRate: { ideal: 30, max: 30 },
          resizeMode: 'crop-and-scale'
        });
      }

      const constraints: MediaStreamConstraints = {
        video: baseVideoConstraints
      };

      await stopCamera();

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = newStream.getVideoTracks()[0];

      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log('Resolución de video:', settings.width, 'x', settings.height);
        
        if (isAndroid) {
          try {
            const capabilities = videoTrack.getCapabilities();
            const advancedConstraints: MediaTrackConstraintSet[] = [];
            
            if (capabilities.exposureMode) {
              advancedConstraints.push({ exposureMode: 'continuous' });
            }
            if (capabilities.focusMode) {
              advancedConstraints.push({ focusMode: 'continuous' });
            }
            if (capabilities.whiteBalanceMode) {
              advancedConstraints.push({ whiteBalanceMode: 'continuous' });
            }

            if (advancedConstraints.length > 0) {
              await videoTrack.applyConstraints({
                advanced: advancedConstraints
              });
            }
          } catch (err) {
            console.log("No se pudieron aplicar algunas optimizaciones:", err);
          }
        }
      }

      if (videoRef.current) {
        if (videoRef.current.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        }
        videoRef.current.srcObject = newStream;
        
        // Forzar modo de pantalla completa cuando el video está listo
        videoRef.current.onloadedmetadata = async () => {
          if (containerRef.current) {
            await requestFullscreen(containerRef.current);
          }
        };
      }

      setStream(newStream);
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }

      // Intentar entrar en modo inmersivo si está disponible
      if (document.documentElement.requestFullscreen && containerRef.current) {
        await requestFullscreen(containerRef.current);
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
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
    };
  }, [isMonitoring]);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 w-screen h-screen bg-black"
      style={{
        height: '100dvh',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          width: '100vw',
          height: '100dvh',
          objectFit: 'cover'
        }}
      />
    </div>
  );
};

export default CameraView;


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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const wakeLockRef = useRef<any>(null);
  const torchTimeoutRef = useRef<number | null>(null);

  const getBatteryLevel = async () => {
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        setBatteryLevel(battery.level * 100);
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(battery.level * 100);
        });
      }
    } catch (error) {
      console.log('Error al obtener nivel de batería:', error);
    }
  };

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.log('Error al adquirir wake lock:', err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const stopCamera = async () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      });
      setStream(null);
    }
    if (torchTimeoutRef.current) {
      clearTimeout(torchTimeoutRef.current);
      torchTimeoutRef.current = null;
    }
    releaseWakeLock();
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /android/i.test(navigator.userAgent);
      
      // Configuración base optimizada para batería baja
      const baseVideoConstraints: MediaTrackConstraints = {
        facingMode: 'environment',
        width: { ideal: batteryLevel < 20 ? 480 : 720 },
        height: { ideal: batteryLevel < 20 ? 320 : 480 }
      };

      if (isAndroid) {
        // Ajustes específicos para Android
        Object.assign(baseVideoConstraints, {
          frameRate: { ideal: batteryLevel < 20 ? 20 : 25 },
          resizeMode: 'crop-and-scale'
        });
      }

      const constraints: MediaStreamConstraints = {
        video: baseVideoConstraints
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = newStream.getVideoTracks()[0];

      if (videoTrack && isAndroid) {
        try {
          const capabilities = videoTrack.getCapabilities();
          const advancedConstraints: MediaTrackConstraintSet[] = [];
          
          // Optimizaciones de cámara basadas en el nivel de batería
          if (capabilities.exposureMode) {
            advancedConstraints.push({ 
              exposureMode: batteryLevel < 20 ? 'manual' : 'continuous'
            });
          }
          if (capabilities.focusMode) {
            advancedConstraints.push({ 
              focusMode: 'continuous'
            });
          }
          if (capabilities.whiteBalanceMode) {
            advancedConstraints.push({ 
              whiteBalanceMode: batteryLevel < 20 ? 'manual' : 'continuous'
            });
          }

          if (advancedConstraints.length > 0) {
            await videoTrack.applyConstraints({
              advanced: advancedConstraints
            });
          }

          // Control automático de la linterna
          if (videoTrack.getCapabilities()?.torch) {
            const manageTorch = async () => {
              if (!isFingerDetected) {
                await videoTrack.applyConstraints({
                  advanced: [{ torch: false }]
                });
              } else {
                await videoTrack.applyConstraints({
                  advanced: [{ torch: true }]
                });
              }
            };

            // Gestión eficiente de la linterna
            if (torchTimeoutRef.current) {
              clearTimeout(torchTimeoutRef.current);
            }
            torchTimeoutRef.current = window.setTimeout(manageTorch, 1000);
          }

          if (videoRef.current) {
            videoRef.current.style.transform = 'translateZ(0)';
            videoRef.current.style.backfaceVisibility = 'hidden';
          }
        } catch (err) {
          console.log("No se pudieron aplicar algunas optimizaciones:", err);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
        }
      }

      setStream(newStream);
      acquireWakeLock();
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
    }
  };

  useEffect(() => {
    getBatteryLevel();
    
    if (isMonitoring && !stream) {
      startCamera();
    } else if (!isMonitoring && stream) {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isMonitoring]);

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
        backfaceVisibility: 'hidden'
      }}
    />
  );
};

export default CameraView;

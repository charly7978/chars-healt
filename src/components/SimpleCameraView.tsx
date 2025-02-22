
import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint, Camera, RefreshCcw } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface SimpleCameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const SimpleCameraView = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}: SimpleCameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCamera, setCurrentCamera] = useState<string>('');
  const [error, setError] = useState<string>('');

  const getAvailableCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(cameras);
      console.log("Cámaras disponibles:", cameras);
      
      // Si no hay cámara seleccionada, usar la primera
      if (!currentCamera && cameras.length > 0) {
        setCurrentCamera(cameras[0].deviceId);
      }
    } catch (err) {
      console.error("Error al enumerar dispositivos:", err);
      setError("No se pudieron obtener las cámaras disponibles");
    }
  };

  const switchCamera = async () => {
    const currentIndex = availableCameras.findIndex(cam => cam.deviceId === currentCamera);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    setCurrentCamera(availableCameras[nextIndex].deviceId);
  };

  useEffect(() => {
    getAvailableCameras();
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia no está soportado");
        }

        // Configuración optimizada para rendimiento con propiedades válidas
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: currentCamera ? { exact: currentCamera } : undefined,
            facingMode: currentCamera ? undefined : 'environment',
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15 }
          }
        };

        // Si hay un stream anterior, detenerlo
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Aplicar configuraciones adicionales al video
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('autoplay', 'true');
          
          if (onStreamReady) {
            onStreamReady(stream);
          }

          // Configurar la linterna si está disponible
          const track = stream.getVideoTracks()[0];
          console.log("Capacidades de la cámara:", track.getCapabilities());
          
          videoRef.current.onloadedmetadata = async () => {
            try {
              if (track?.getCapabilities()?.torch) {
                await track.applyConstraints({
                  advanced: [{ torch: true }]
                });
                console.log("Linterna activada");
              }
            } catch (err) {
              console.log("No se pudo activar la linterna:", err);
            }
          };
        }
      } catch (err) {
        console.error("Error al iniciar la cámara:", err);
        setError("Error al iniciar la cámara. Intente con otra cámara.");
      }
    };

    const stopCamera = () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (isMonitoring && currentCamera) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, currentCamera, onStreamReady]);

  const getFingerColor = () => {
    if (!isFingerDetected) return 'text-gray-400';
    if (signalQuality > 75) return 'text-green-500';
    if (signalQuality > 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ 
          objectFit: 'cover',
          transform: 'scaleX(-1)'
        }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30 bg-red-500/80 text-white px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {isMonitoring && availableCameras.length > 1 && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-4 right-4 z-30 bg-black/30"
          onClick={switchCamera}
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      )}
      
      {isMonitoring && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center">
          <Fingerprint
            size={48}
            className={`transition-colors duration-300 ${getFingerColor()}`}
          />
          <span className={`text-xs mt-2 transition-colors duration-300 ${
            isFingerDetected ? 'text-green-500' : 'text-gray-400'
          }`}>
            {isFingerDetected ? "dedo detectado" : "ubique su dedo en el lente"}
          </span>
        </div>
      )}
    </>
  );
};

export default SimpleCameraView;

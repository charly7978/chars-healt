
import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint, SwitchCamera } from 'lucide-react';
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
  const [isAndroid, setIsAndroid] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setIsAndroid(/Android/i.test(navigator.userAgent));
  }, []);

  const getAvailableCameras = async () => {
    if (availableCameras.length > 0) return; // Evitar escaneos innecesarios

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(cameras);
      
      if (isAndroid) {
        const backCamera = cameras.find(camera => 
          camera.label.toLowerCase().includes('back') || 
          camera.label.toLowerCase().includes('trasera') ||
          camera.label.toLowerCase().includes('environment') ||
          camera.label.toLowerCase().includes('0')
        );
        
        if (backCamera) {
          setCurrentCamera(backCamera.deviceId);
        } else if (cameras.length > 0) {
          setCurrentCamera(cameras[0].deviceId);
        }
      } else if (cameras.length > 0) {
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
    if (isMonitoring) {
      getAvailableCameras();
    }
  }, [isMonitoring, isAndroid]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia no está soportado");
        }

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: currentCamera ? { exact: currentCamera } : undefined,
            facingMode: currentCamera ? undefined : 'environment',
            width: { ideal: isAndroid ? 720 : 640 }, // Reducida para mejor rendimiento
            height: { ideal: isAndroid ? 480 : 480 },
            frameRate: { ideal: isAndroid ? 15 : 30 }, // Reducido en Android
            aspectRatio: { ideal: 4/3 }
          }
        };

        // Limpiar stream anterior
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
            streamRef.current?.removeTrack(track);
          });
        }

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = newStream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          videoRef.current.setAttribute('playsinline', 'true');
          
          if (isAndroid) {
            videoRef.current.style.transform = 'scaleX(-1) rotate(90deg)';
          } else {
            videoRef.current.style.transform = 'scaleX(-1)';
          }
          
          if (onStreamReady) {
            onStreamReady(newStream);
          }
        }
      } catch (err) {
        console.error("Error al iniciar la cámara:", err);
        setError("Error al iniciar la cámara. Intente con otra cámara.");
      }
    };

    const stopCamera = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          streamRef.current?.removeTrack(track);
        });
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (isMonitoring && currentCamera) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, currentCamera, onStreamReady, isAndroid]);

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
        autoPlay
        className={`absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 ${
          isAndroid ? 'object-cover' : 'object-contain'
        }`}
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
          className="absolute top-4 right-4 z-30 bg-black/30 hover:bg-black/50"
          onClick={switchCamera}
        >
          <SwitchCamera className="h-4 w-4" />
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

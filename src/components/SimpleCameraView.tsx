
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

  useEffect(() => {
    setIsAndroid(/Android/i.test(navigator.userAgent));
  }, []);

  const getAvailableCameras = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(cameras);
      
      if (isAndroid) {
        const backCamera = cameras.find(camera => 
          camera.label.toLowerCase().includes('back') || 
          camera.label.toLowerCase().includes('trasera') ||
          camera.label.toLowerCase().includes('environment')
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
  }, [isMonitoring]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia no está soportado");
        }

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: currentCamera ? { exact: currentCamera } : undefined,
            facingMode: currentCamera ? undefined : 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
            // Forzar modo normal de la cámara
            whiteBalanceMode: { exact: "continuous" },
            exposureMode: { exact: "continuous" },
            exposureCompensation: { ideal: 0 },
            brightness: { ideal: 100 },
            contrast: { ideal: 100 },
            saturation: { ideal: 100 },
            sharpness: { ideal: 100 },
            focusMode: { exact: "continuous" },
            // Deshabilitar modo noche
            colorTemperature: { ideal: 5000 }, // Temperatura de color natural
            advanced: [{
              // Estos son constraints específicos para Android
              exposureTime: { ideal: 33333 }, // 1/30 segundo
              sensitivityISO: { ideal: 100 }, // ISO bajo para evitar modo noche
              torch: false,
              noiseReduction: "fast",
              autoExposurePriority: true
            }]
          }
        };

        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Aplicar configuraciones adicionales al track de video
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            await videoTrack.applyConstraints({
              advanced: [{
                torch: false,
                manual_exposure: false,
                exposure_time: 33333, // 1/30 segundo
                exposure_compensation: 0,
                white_balance_mode: "continuous",
                focus_mode: "continuous"
              }]
            });
          } catch (e) {
            console.warn("No se pudieron aplicar todas las configuraciones avanzadas:", e);
          }
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          
          if (isAndroid) {
            videoRef.current.style.transform = 'scaleX(-1) rotate(90deg)';
          } else {
            videoRef.current.style.transform = 'scaleX(-1)';
          }
          
          if (onStreamReady) {
            onStreamReady(stream);
          }
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
        style={{
          willChange: 'transform', // Optimización de rendimiento
          backfaceVisibility: 'hidden' // Optimización de rendimiento
        }}
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

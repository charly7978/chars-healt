
import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
  buttonPosition?: DOMRect;
  onError?: (error: string) => void;
  onFrameProcessed?: (imageData: ImageData) => void;
}

const CameraView = ({ 
  onStreamReady, 
  isMonitoring, 
  isFingerDetected = false, 
  signalQuality = 0,
  buttonPosition,
  onError,
  onFrameProcessed 
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const stopCamera = async () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
      setIsVideoReady(false);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 720 },
          height: { ideal: 480 }
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        
        // Wait for video metadata to load
        await new Promise<void>((resolve) => {
          if (!videoRef.current) return;
          
          const handleLoaded = () => {
            setIsVideoReady(true);
            resolve();
          };
          
          videoRef.current.onloadedmetadata = handleLoaded;
          
          // If the video is already loaded, resolve immediately
          if (videoRef.current.readyState >= 2) {
            handleLoaded();
          }
        });
      }

      setStream(newStream);
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
      if (onError) {
        onError(err instanceof Error ? err.message : "Error desconocido al iniciar la cámara");
      }
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
    };
  }, [isMonitoring]);

  useEffect(() => {
    const processVideoFrame = () => {
      if (!videoRef.current || !onFrameProcessed || !stream || !isVideoReady) return;

      const video = videoRef.current;
      
      // Check if video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('Video dimensions not ready yet');
        return;
      }

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;

      // Set canvas size to match video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      try {
        context.drawImage(video, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        onFrameProcessed(imageData);
      } catch (error) {
        console.error('Error processing video frame:', error);
      }
    };

    let frameId: number;
    const animate = () => {
      processVideoFrame();
      frameId = requestAnimationFrame(animate);
    };

    if (isMonitoring && stream && isVideoReady) {
      animate();
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isMonitoring, stream, onFrameProcessed, isVideoReady]);

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/20" />
      {isMonitoring && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center">
          <Fingerprint
            size={48}
            className={`transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              signalQuality > 75 ? 'text-green-500' :
              signalQuality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
          />
          <span className={`text-xs mt-2 transition-colors duration-300 ${
            isFingerDetected ? 'text-green-500' : 'text-gray-400'
          }`}>
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en el lente"}
          </span>
        </div>
      )}
    </div>
  );
};

export default CameraView;

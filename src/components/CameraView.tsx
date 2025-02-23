
import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
  buttonPosition?: DOMRect;
}

const CameraView = ({ 
  onStreamReady, 
  isMonitoring, 
  isFingerDetected = false, 
  signalQuality = 0,
  buttonPosition 
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);

  const stopCamera = async () => {
    console.log("Stopping camera...");
    processingRef.current = false;
    
    try {
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          console.log("Stopping track:", track.label);
          track.stop();
        });
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      streamRef.current = null;
      setStream(null);
      console.log("Camera stopped successfully");
    } catch (err) {
      console.error("Error stopping camera:", err);
    }
  };

  const startCamera = async () => {
    console.log("Starting camera...");
    try {
      await stopCamera(); // Ensure clean state

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported");
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 720 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        }
      };

      console.log("Requesting camera with constraints:", constraints);
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Camera stream obtained:", newStream.getVideoTracks()[0].label);
      
      // Store stream reference
      streamRef.current = newStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }

      setStream(newStream);
      processingRef.current = true;
      
      if (onStreamReady) {
        onStreamReady(newStream);
      }

      console.log("Camera started successfully");
    } catch (err) {
      console.error("Error starting camera:", err);
      processingRef.current = false;
    }
  };

  useEffect(() => {
    console.log("CameraView effect - isMonitoring changed:", isMonitoring);
    
    if (isMonitoring) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      console.log("CameraView cleanup");
      stopCamera();
    };
  }, [isMonitoring]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
      />
      {isMonitoring && buttonPosition && (
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
            {isFingerDetected ? "dedo detectado" : "ubique su dedo en el lente"}
          </span>
        </div>
      )}
    </>
  );
};

export default CameraView;

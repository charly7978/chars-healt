
import React, { useEffect, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import VideoDisplay from './camera/VideoDisplay';
import CameraError from './camera/CameraError';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView: React.FC<CameraViewProps> = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}) => {
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  
  const {
    videoRef,
    mountedRef,
    error,
    isAndroid,
    detectAndroid,
    startCamera,
    stopCamera
  } = useCamera({ onStreamReady, isMonitoring });

  // Detect Android on mount
  useEffect(() => {
    detectAndroid();
  }, [detectAndroid]);

  // Effect to start/stop camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring changed to:", isMonitoring);
    setDebugInfo(`Camera active: ${isMonitoring ? 'Yes' : 'No'}`);
    
    if (isMonitoring) {
      // Use a longer timeout for Android to ensure camera initialization
      const timeoutId = setTimeout(() => {
        startCamera();
        setDebugInfo(`Starting camera, Android: ${isAndroid ? 'Yes' : 'No'}`);
      }, isAndroid ? 800 : 300);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
      setDebugInfo('Camera stopped');
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Cleanup effect when mounting/unmounting component
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Component mounted");
    setDebugInfo('CameraView mounted');

    // Make sure camera permissions are available
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Just checking permissions, stop stream immediately
        stream.getTracks().forEach(track => track.stop());
        console.log("CameraView: Camera permissions verified");
        setDebugInfo('Camera permissions verified');
      })
      .catch(err => {
        console.error("CameraView: Error verifying camera permissions:", err);
        setDebugInfo(`Camera permission error: ${err.message}`);
      });

    return () => {
      console.log("CameraView: Component unmounting");
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <>
      <VideoDisplay 
        videoRef={videoRef} 
        isMonitoring={isMonitoring} 
        isAndroid={isAndroid} 
      />
      <CameraError error={error} />
      
      {/* Add debug info - will remove in production */}
      {debugInfo && (
        <div className="absolute bottom-5 left-0 z-50 bg-black/70 text-white p-2 text-xs font-mono rounded m-2">
          {debugInfo}
        </div>
      )}
    </>
  );
};

export default React.memo(CameraView);

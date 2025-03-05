
import { useCallback, useRef, useState } from 'react';
import { isAndroidDevice, createCameraConstraints, applyAndroidOptimizations, controlTorch } from '../utils/cameraUtils';

interface UseCameraProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
}

export const useCamera = ({ onStreamReady, isMonitoring }: UseCameraProps) => {
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);

  // Check if device is Android
  const detectAndroid = useCallback(() => {
    setIsAndroid(isAndroidDevice());
  }, []);

  // Stop camera and release resources
  const stopCamera = useCallback(() => {
    console.log("CameraView: Stopping camera");
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        try {
          // First turn off torch if available
          if ('getCapabilities' in track && track.getCapabilities()?.torch) {
            controlTorch(track, false).catch(err => console.error("Error turning off torch:", err));
          }
        } catch (err) {
          console.error("Error with torch:", err);
        }
        
        // Wait a moment before stopping the track (helps with Android)
        setTimeout(() => {
          if (track.readyState === 'live') {
            track.stop();
          }
        }, 50);
      });

      streamRef.current = null;
    }

    // Clean up video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start the camera
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: Not starting camera because isMonitoring is false");
      return;
    }
    
    initializingRef.current = true;
    console.log("CameraView: Starting camera");
    setError(null);
    
    try {
      // Make sure any previous stream is stopped
      stopCamera();
      
      // Wait a moment for resources to be released (especially on Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 50));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia API is not available');
      }

      // Get camera with platform-specific configuration
      const constraints = createCameraConstraints(isAndroid);
      console.log("CameraView: Requesting camera access with constraints:", constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("CameraView: Camera access granted, tracks:", mediaStream.getTracks().length);
      
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Component unmounted or not monitoring, releasing stream");
        mediaStream.getTracks().forEach(track => track.stop());
        initializingRef.current = false;
        return;
      }

      streamRef.current = mediaStream;

      // Apply platform-specific optimizations
      if (isAndroid) {
        console.log("CameraView: Applying Android optimizations");
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          await applyAndroidOptimizations(videoTrack);
        }
      }

      // Set up video element
      if (videoRef.current) {
        console.log("CameraView: Assigning stream to video element");
        
        // Android-specific optimizations for video element
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.transform = 'translateZ(0)';
          videoRef.current.style.backfaceVisibility = 'hidden';
        }
        
        videoRef.current.srcObject = mediaStream;
        
        // On Android, wait for optimizations to apply before playing
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : 0));
        
        await videoRef.current.play().catch(e => {
          console.error("Error playing video:", e);
          throw e;
        });
        console.log("CameraView: Video playing correctly");
      } else {
        console.error("CameraView: Video element not available");
      }

      // Wait a moment before turning on the torch on Android
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 200 : 0));

      // Try to turn on torch if we're monitoring
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        await controlTorch(videoTrack, true);
      }

      // Notify that stream is ready
      if (onStreamReady && isMonitoring) {
        console.log("CameraView: Notifying stream ready");
        onStreamReady(mediaStream);
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      setError(`Error starting camera: ${error instanceof Error ? error.message : String(error)}`);
      stopCamera();
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid]);

  return {
    videoRef,
    streamRef,
    mountedRef,
    initializingRef,
    error,
    isAndroid,
    detectAndroid,
    startCamera,
    stopCamera
  };
};

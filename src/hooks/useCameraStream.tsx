
import { useCallback } from 'react';

export function useCameraStream() {
  const handleStreamReady = useCallback((stream: MediaStream, isMonitoring: boolean, processFrame: (imageData: ImageData) => void) => {
    if (!isMonitoring) return;
    
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        console.error("No video track available in stream");
        return;
      }
      
      const imageCapture = new ImageCapture(videoTrack);
      
      if (videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        }).catch(err => console.error("Error activando linterna:", err));
      }
      
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        console.error("No se pudo obtener el contexto 2D");
        return;
      }
      
      let frameProcessingActive = true;
      
      const processImage = async () => {
        if (!isMonitoring || !frameProcessingActive) return;
        
        try {
          if (videoTrack.readyState !== 'live') {
            console.log('Video track is not in live state, waiting...');
            if (isMonitoring && frameProcessingActive) {
              setTimeout(() => requestAnimationFrame(processImage), 500);
            }
            return;
          }
          
          const frame = await imageCapture.grabFrame();
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          processFrame(imageData);
          
          if (isMonitoring && frameProcessingActive) {
            requestAnimationFrame(processImage);
          }
        } catch (error) {
          console.error("Error capturando frame:", error);
          if (isMonitoring && frameProcessingActive) {
            setTimeout(() => requestAnimationFrame(processImage), 500);
          }
        }
      };

      processImage();
      
      return () => {
        console.log("Cleaning up video processing resources");
        frameProcessingActive = false;
        
        if (videoTrack.getCapabilities()?.torch) {
          videoTrack.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
      };
    } catch (error) {
      console.error("Error setting up image capture:", error);
      return () => {};
    }
  }, []);

  return {
    handleStreamReady
  };
}

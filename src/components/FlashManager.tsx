
import { useEffect } from 'react';

interface FlashManagerProps {
  isMonitoring: boolean;
  isCameraOn: boolean;
}

const FlashManager: React.FC<FlashManagerProps> = ({ isMonitoring, isCameraOn }) => {
  // Asegurarse que la linterna se apague cuando cambie isMonitoring
  useEffect(() => {
    if (!isMonitoring && isCameraOn) {
      // Intentar apagar el flash si estaba encendido y ahora paramos
      try {
        const turnOffFlash = async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack && videoTrack.getCapabilities()?.torch) {
            try {
              await videoTrack.applyConstraints({
                advanced: [{ torch: false }]
              });
            } catch (err) {
              console.error("Error desactivando linterna:", err);
            }
          }
          stream.getTracks().forEach(track => track.stop());
        };
        
        turnOffFlash();
      } catch (err) {
        console.error("Error al acceder a la cámara para apagar la linterna:", err);
      }
    }
  }, [isMonitoring, isCameraOn]);

  return null;
};

export default FlashManager;

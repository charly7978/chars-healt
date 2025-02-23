import { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const measurementTimerRef = useRef<number | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const startMonitoring = () => {
    setIsMonitoring(true);
    setIsCameraOn(true);
    startProcessing();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
    }
    
    measurementTimerRef.current = window.setInterval(() => {
      setElapsedTime(prev => {
        if (prev >= 30) {
          stopMonitoring();
          return 30;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    resetVitalSigns();
    setElapsedTime(0);
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--" 
    });
    setArrhythmiaCount("--");
    setSignalQuality(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    const videoTrack = stream.getVideoTracks()[0];
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
    
    const processImage = async () => {
      if (!isMonitoring) return;
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        processFrame(imageData);
        
        if (isMonitoring) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Error capturando frame:", error);
        if (isMonitoring) {
          requestAnimationFrame(processImage);
        }
      }
    };

    processImage();
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus);
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  useEffect(() => {
    const enforceResolution = () => {
      const width = 412; // Ancho típico de un dispositivo móvil en Chrome
      const height = 915; // Alto típico de un dispositivo móvil en Chrome
      
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const scale = Math.min(windowWidth / width, windowHeight / height);
      
      document.documentElement.style.setProperty('--app-width', `${width}px`);
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      document.documentElement.style.setProperty('--app-scale', scale.toString());
      
      document.body.style.display = 'none';
      document.body.offsetHeight;
      document.body.style.display = '';
      
      document.documentElement.style.zoom = '1';
      
      if (window.screen?.orientation) {
        try {
          if (window.matchMedia("(orientation: landscape)").matches) {
            console.log('Please rotate your device to portrait mode');
          }
        } catch (e) {
          console.log('Orientation detection not supported');
        }
      }
      
      const pixelRatio = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    };

    enforceResolution();
    window.addEventListener('resize', enforceResolution);
    window.addEventListener('orientationchange', enforceResolution);

    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.addEventListener('gesturestart', preventDefault);
    document.addEventListener('gesturechange', preventDefault);
    document.addEventListener('gestureend', preventDefault);

    return () => {
      window.removeEventListener('resize', enforceResolution);
      window.removeEventListener('orientationchange', enforceResolution);
      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('gesturestart', preventDefault);
      document.removeEventListener('gesturechange', preventDefault);
      document.removeEventListener('gestureend', preventDefault);
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black overflow-hidden touch-none select-none"
      style={{
        width: 'var(--app-width)',
        height: 'var(--app-height)',
        transform: `scale(var(--app-scale))`,
        transformOrigin: 'top left',
        position: 'fixed',
        top: 0,
        left: 0
      }}
    >
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady}
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
            buttonPosition={document.querySelector('.measure-button')?.getBoundingClientRect()}
          />
        </div>

        <div className="relative z-10 h-full">
          <PPGSignalMeter 
            value={lastSignal?.filteredValue || 0}
            quality={lastSignal?.quality || 0}
            isFingerDetected={lastSignal?.fingerDetected || false}
            onStartMeasurement={startMonitoring}
            onReset={stopMonitoring}
          />

          <div className="absolute bottom-[240px] left-0 right-0 px-4">
            <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl p-4 space-y-4">
              <div className="flex justify-center gap-4">
                <VitalSign 
                  label="Heart Rate"
                  value={heartRate || "--"}
                  unit="BPM"
                />
                <VitalSign 
                  label="SpO2"
                  value={vitalSigns.spo2 || "--"}
                  unit="%"
                />
              </div>
              <div className="flex justify-center gap-4">
                <VitalSign 
                  label="Blood Pressure"
                  value={vitalSigns.pressure}
                  unit="mmHg"
                />
                <VitalSign 
                  label="Arrhythmias"
                  value={`${vitalSigns.arrhythmiaStatus}|${arrhythmiaCount}`}
                />
              </div>
            </div>
          </div>

          {isMonitoring && (
            <div className="absolute bottom-20 left-0 right-0 text-center">
              <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 30s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;

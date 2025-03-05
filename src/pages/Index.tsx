
import React, { useState } from "react";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import { useImmersiveMode } from "@/hooks/useImmersiveMode";
import { useCameraStream } from "@/hooks/useCameraStream";
import VitalSignsDisplay from "@/components/VitalSignsDisplay";
import VitalSignsMonitor from "@/components/VitalSignsMonitor";
import ControlButtons from "@/components/ControlButtons";
import PermissionsMessage from "@/components/PermissionsMessage";
import MeasurementTimer from "@/components/MeasurementTimer";

const Index = () => {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  
  const {
    isMonitoring,
    isCameraOn,
    signalQuality,
    vitalSigns,
    heartRate,
    elapsedTime,
    measurementComplete,
    finalValues,
    lastArrhythmiaData,
    lastSignal,
    processFrame,
    startMonitoring,
    handleReset,
    stopMonitoringOnly
  } = useVitalMeasurement();
  
  const { handleStreamReady } = useCameraStream();
  
  // Setup immersive mode
  useImmersiveMode();
  
  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
  };
  
  const onStreamReady = (stream: MediaStream) => {
    handleStreamReady(stream, isMonitoring, processFrame);
  };

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100%',
        maxHeight: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden',
        paddingTop: 'var(--sat)',
        paddingRight: 'var(--sar)',
        paddingBottom: 'var(--sab)',
        paddingLeft: 'var(--sal)',
      }}
    >
      <PermissionsHandler 
        onPermissionsGranted={handlePermissionsGranted}
        onPermissionsDenied={handlePermissionsDenied}
      />
      
      <VitalSignsMonitor
        isMonitoring={isMonitoring}
        isCameraOn={isCameraOn}
        permissionsGranted={permissionsGranted}
        signalQuality={signalQuality}
        lastSignal={lastSignal}
        onStreamReady={onStreamReady}
      />

      <div className="absolute inset-0 z-10">
        <PPGSignalMeter 
          value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
          quality={isMonitoring ? lastSignal?.quality || 0 : 0}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
          onStartMeasurement={startMonitoring}
          onReset={handleReset}
          arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
          rawArrhythmiaData={lastArrhythmiaData}
        />
      </div>
      
      <VitalSignsDisplay
        vitalSigns={vitalSigns}
        heartRate={heartRate}
        finalValues={finalValues}
        measurementComplete={measurementComplete}
      />
      
      <MeasurementTimer 
        isMonitoring={isMonitoring}
        elapsedTime={elapsedTime}
      />
      
      <ControlButtons
        isMonitoring={isMonitoring}
        permissionsGranted={permissionsGranted}
        onStartMonitoring={startMonitoring}
        onReset={handleReset}
      />
      
      <PermissionsMessage permissionsGranted={permissionsGranted} />
    </div>
  );
};

export default Index;

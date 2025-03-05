
import React, { useState, useMemo, useCallback } from "react";
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
  
  // Uso del hook optimizado de medición de signos vitales
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
  
  const handlePermissionsGranted = useCallback(() => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  }, []);

  const handlePermissionsDenied = useCallback(() => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
  }, []);
  
  const onStreamReady = useCallback((stream: MediaStream) => {
    handleStreamReady(stream, isMonitoring, processFrame);
  }, [handleStreamReady, isMonitoring, processFrame]);

  // Memoizamos los componentes para evitar re-renderizados innecesarios
  const permissionsHandler = useMemo(() => (
    <PermissionsHandler 
      onPermissionsGranted={handlePermissionsGranted}
      onPermissionsDenied={handlePermissionsDenied}
    />
  ), [handlePermissionsGranted, handlePermissionsDenied]);

  const vitalSignsMonitor = useMemo(() => (
    <VitalSignsMonitor
      isMonitoring={isMonitoring}
      isCameraOn={isCameraOn}
      permissionsGranted={permissionsGranted}
      signalQuality={signalQuality}
      lastSignal={lastSignal}
      onStreamReady={onStreamReady}
    />
  ), [isMonitoring, isCameraOn, permissionsGranted, signalQuality, lastSignal, onStreamReady]);

  const ppgSignalMeter = useMemo(() => (
    <PPGSignalMeter 
      value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
      quality={isMonitoring ? lastSignal?.quality || 0 : 0}
      isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
      onStartMeasurement={startMonitoring}
      onReset={handleReset}
      arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
      rawArrhythmiaData={lastArrhythmiaData}
    />
  ), [isMonitoring, lastSignal, startMonitoring, handleReset, vitalSigns.arrhythmiaStatus, lastArrhythmiaData]);

  const vitalSignsDisplay = useMemo(() => (
    <VitalSignsDisplay
      vitalSigns={vitalSigns}
      heartRate={heartRate}
      finalValues={finalValues}
      measurementComplete={measurementComplete}
    />
  ), [vitalSigns, heartRate, finalValues, measurementComplete]);

  const measurementTimer = useMemo(() => (
    <MeasurementTimer 
      isMonitoring={isMonitoring}
      elapsedTime={elapsedTime}
    />
  ), [isMonitoring, elapsedTime]);

  const controlButtons = useMemo(() => (
    <ControlButtons
      isMonitoring={isMonitoring}
      permissionsGranted={permissionsGranted}
      onStartMonitoring={startMonitoring}
      onReset={handleReset}
    />
  ), [isMonitoring, permissionsGranted, startMonitoring, handleReset]);

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
      {permissionsHandler}
      
      {vitalSignsMonitor}

      <div className="absolute inset-0 z-10">
        {ppgSignalMeter}
      </div>
      
      {vitalSignsDisplay}
      
      {measurementTimer}
      
      {controlButtons}
      
      <PermissionsMessage permissionsGranted={permissionsGranted} />
    </div>
  );
};

export default React.memo(Index);


import React from "react";
import VitalSignsGrid from "@/components/VitalSignsGrid";
import CameraView from "@/components/CameraView";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import BottomControls from "@/components/BottomControls";
import PermissionsMessage from "@/components/PermissionsMessage";
import { useMonitoring } from "@/hooks/useMonitoring";
import { useImmersiveMode } from "@/hooks/useImmersiveMode";

const Index = () => {
  const {
    isMonitoring,
    isCameraOn,
    signalQuality,
    vitalSigns,
    heartRate,
    elapsedTime,
    lastArrhythmiaData,
    measurementComplete,
    finalValues,
    permissionsGranted,
    handlePermissionsGranted,
    handlePermissionsDenied,
    startMonitoring,
    handleReset,
    handleStreamReady,
    lastSignal
  } = useMonitoring();

  // Activar modo inmersivo
  useImmersiveMode();

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
      
      <div className="absolute inset-0 z-0">
        <CameraView 
          onStreamReady={handleStreamReady}
          isMonitoring={isCameraOn && permissionsGranted}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
          signalQuality={isMonitoring ? signalQuality : 0}
        />
        <div 
          className="absolute inset-0" 
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.8)', 
            backdropFilter: 'blur(2px)' 
          }} 
        />
      </div>

      <div className="absolute inset-0 z-10">
        <PPGSignalMeter 
          value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
          quality={isMonitoring ? lastSignal?.quality || 0 : 0}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
          onStartMeasurement={startMonitoring}
          onReset={handleReset}
          arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
          rawArrhythmiaData={lastArrhythmiaData}
          lipidData={vitalSigns.lipids}
        />
      </div>
      
      <div className="absolute z-20" style={{ bottom: '55px', left: 0, right: 0, padding: '0 8px' }}>
        <VitalSignsGrid 
          finalValues={finalValues}
          vitalSigns={vitalSigns}
          heartRate={heartRate}
          measurementComplete={measurementComplete}
        />
      </div>

      <div className="absolute z-50" style={{ bottom: 0, left: 0, right: 0, height: '45px' }}>
        <BottomControls
          startMonitoring={startMonitoring}
          handleReset={handleReset}
          permissionsGranted={permissionsGranted}
          isMonitoring={isMonitoring}
        />
      </div>
      
      <PermissionsMessage permissionsGranted={permissionsGranted} />
    </div>
  );
};

export default Index;

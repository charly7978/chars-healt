
import React from "react";
import PermissionsHandler from "@/components/PermissionsHandler";
import PermissionsMessage from "@/components/PermissionsMessage";
import { useImmersiveMode } from "@/hooks/useImmersiveMode";
import { useVitalSignsMonitoring } from "@/hooks/useVitalSignsMonitoring";
import PageContainer from "@/components/layout/PageContainer";
import CameraBackgroundLayer from "@/components/layers/CameraBackgroundLayer";
import SignalDisplayLayer from "@/components/layers/SignalDisplayLayer";
import VitalSignsLayer from "@/components/layers/VitalSignsLayer";
import ControlsLayer from "@/components/layers/ControlsLayer";

/**
 * Main application page that coordinates all monitoring components
 */
const Index = () => {
  const {
    isMonitoring,
    isCameraOn,
    signalQuality,
    vitalSigns,
    heartRate,
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
  } = useVitalSignsMonitoring();

  // Activate immersive mode
  useImmersiveMode();

  return (
    <PageContainer>
      <PermissionsHandler 
        onPermissionsGranted={handlePermissionsGranted}
        onPermissionsDenied={handlePermissionsDenied}
      />
      
      <CameraBackgroundLayer 
        handleStreamReady={handleStreamReady}
        isCameraOn={isCameraOn} 
        permissionsGranted={permissionsGranted}
        isMonitoring={isMonitoring}
        lastSignal={lastSignal}
        signalQuality={signalQuality}
      />

      <SignalDisplayLayer 
        isMonitoring={isMonitoring}
        lastSignal={lastSignal}
        startMonitoring={startMonitoring}
        handleReset={handleReset}
        vitalSigns={vitalSigns}
        lastArrhythmiaData={lastArrhythmiaData}
      />
      
      <VitalSignsLayer 
        finalValues={finalValues}
        vitalSigns={vitalSigns}
        heartRate={heartRate}
        measurementComplete={measurementComplete}
      />

      <ControlsLayer 
        startMonitoring={startMonitoring}
        handleReset={handleReset}
        permissionsGranted={permissionsGranted}
        isMonitoring={isMonitoring}
      />
      
      <PermissionsMessage permissionsGranted={permissionsGranted} />
    </PageContainer>
  );
};

export default Index;

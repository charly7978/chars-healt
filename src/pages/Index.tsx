
import React from "react";
import CameraView from "@/components/CameraView";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import VitalSignsDisplay from "@/components/VitalSignsDisplay";
import MeasurementControls from "@/components/MeasurementControls";
import ElapsedTimeDisplay from "@/components/ElapsedTimeDisplay";
import ImmersiveMode from "@/components/ImmersiveMode";
import FlashManager from "@/components/FlashManager";
import { useMeasurement } from "@/hooks/useMeasurement";

const Index = () => {
  const [
    {
      isMonitoring,
      isCameraOn,
      signalQuality,
      vitalSigns,
      heartRate,
      arrhythmiaCount,
      elapsedTime,
      lastArrhythmiaData,
      measurementComplete,
      finalValues,
      lastSignal
    },
    {
      startMonitoring,
      handleReset,
      handleStreamReady
    }
  ] = useMeasurement();

  return (
    <div 
      className="fixed inset-0" 
      style={{ 
        height: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Componentes invisibles que manejan efectos */}
      <ImmersiveMode />
      <FlashManager isMonitoring={isMonitoring} isCameraOn={isCameraOn} />

      {/* Vista de cámara */}
      <CameraView 
        onStreamReady={handleStreamReady}
        isMonitoring={isCameraOn}
        isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
        signalQuality={isMonitoring ? signalQuality : 0}
      />

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col z-10">
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

      {/* Muestra de signos vitales */}
      <VitalSignsDisplay 
        finalValues={finalValues}
        currentValues={{
          heartRate,
          spo2: vitalSigns.spo2,
          pressure: vitalSigns.pressure,
          arrhythmiaStatus: vitalSigns.arrhythmiaStatus
        }}
        isFinalReading={measurementComplete}
      />

      {/* Display de tiempo transcurrido */}
      <ElapsedTimeDisplay 
        elapsedTime={elapsedTime}
        isMonitoring={isMonitoring}
      />

      {/* Controles de medición */}
      <MeasurementControls 
        isMonitoring={isMonitoring}
        onStart={startMonitoring}
        onReset={handleReset}
      />
    </div>
  );
};

export default Index;

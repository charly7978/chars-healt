
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
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: 'calc(100vh + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      {/* Componentes invisibles que manejan efectos */}
      <ImmersiveMode />
      <FlashManager isMonitoring={isMonitoring} isCameraOn={isCameraOn} />

      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady}
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col">
          <div className="flex-1">
            <PPGSignalMeter 
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
              onStartMeasurement={startMonitoring}
              onReset={handleReset}
              arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
              rawArrhythmiaData={lastArrhythmiaData}
            />
          </div>

          <div className="absolute bottom-[200px] left-0 right-0 px-4">
            <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl p-4">
              <div className="grid grid-cols-4 gap-2">
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
              </div>
            </div>
          </div>

          <ElapsedTimeDisplay 
            elapsedTime={elapsedTime}
            isMonitoring={isMonitoring}
          />

          <MeasurementControls 
            isMonitoring={isMonitoring}
            onStart={startMonitoring}
            onReset={handleReset}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;

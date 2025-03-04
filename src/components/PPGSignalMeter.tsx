
import React from 'react';

interface CholesterolData {
  totalCholesterol: number;
  hdl: number;
  ldl: number;
  triglycerides: number;
}

interface TemperatureData {
  value: number;
  trend: 'stable' | 'rising' | 'falling';
  location: string;
}

export interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus: string;
  cholesterol?: CholesterolData;
  temperature?: TemperatureData;
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({
  value,
  quality,
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  cholesterol,
  temperature
}) => {
  // Prevent UI from disappearing when finger is detected
  const signalDisplay = (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="text-4xl font-bold text-green-500">
        {Math.round(value * 100) / 100}
      </div>
      <div className="mt-2 text-sm text-gray-400">
        Signal Quality: {Math.round(quality * 100)}%
      </div>
      <div className="mt-2 text-sm text-gray-400">
        {isFingerDetected ? 'Finger Detected' : 'Place finger on camera'}
      </div>
      {arrhythmiaStatus && arrhythmiaStatus !== "--" && (
        <div className="mt-2 text-sm text-amber-400">
          Arrhythmia: {arrhythmiaStatus}
        </div>
      )}
    </div>
  );
  
  return (
    <div className="w-full h-full relative">
      {/* Always show the signal display regardless of finger detection */}
      {signalDisplay}
      
      {/* Display cholesterol data if available */}
      {cholesterol && cholesterol.totalCholesterol > 0 && (
        <div className="absolute top-4 right-4 bg-black/50 p-2 rounded text-xs">
          <div className="text-green-400">Cholesterol: {cholesterol.totalCholesterol} mg/dL</div>
          <div className="text-blue-400">HDL: {cholesterol.hdl} mg/dL</div>
          <div className="text-yellow-400">LDL: {cholesterol.ldl} mg/dL</div>
          <div className="text-orange-400">Triglycerides: {cholesterol.triglycerides} mg/dL</div>
        </div>
      )}
      
      {/* Display temperature data if available */}
      {temperature && temperature.value > 0 && (
        <div className="absolute top-4 left-4 bg-black/50 p-2 rounded text-xs">
          <div className={`${
            temperature.trend === 'rising' ? 'text-red-400' : 
            temperature.trend === 'falling' ? 'text-blue-400' : 
            'text-white'
          }`}>
            Temp: {temperature.value.toFixed(1)}°C {temperature.trend === 'rising' ? '↑' : temperature.trend === 'falling' ? '↓' : '→'}
            <div className="text-gray-400 text-[10px]">Location: {temperature.location}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PPGSignalMeter;

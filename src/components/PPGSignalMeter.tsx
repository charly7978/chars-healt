
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
  confidence?: number;
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
  rawArrhythmiaData?: any;
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({
  value,
  quality,
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  cholesterol,
  temperature,
  rawArrhythmiaData
}) => {
  // Create the PPG graph visualization
  const graphHeight = 80;
  const signalHeight = Math.min(Math.abs(value * 40), graphHeight);
  
  return (
    <div className="w-full h-full relative">
      {/* Always show the signal display and graph regardless of finger detection */}
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
        
        {/* PPG Graph visualization */}
        <div className="w-full max-w-[300px] h-[80px] mt-4 bg-black/40 rounded-md overflow-hidden border border-gray-800">
          <div 
            className="w-full bg-green-500/50 transition-all duration-75"
            style={{ 
              height: `${signalHeight}px`,
              transform: `translateY(${graphHeight - signalHeight}px)`
            }}
          />
        </div>
      </div>
      
      {/* Display cholesterol data if available */}
      {cholesterol && cholesterol.totalCholesterol > 0 && (
        <div className="absolute top-4 right-4 bg-black/60 p-3 rounded-md shadow-lg border border-gray-700">
          <div className="text-lg font-semibold text-white mb-1">Cholesterol</div>
          <div className="flex flex-col gap-1">
            <div className="text-green-400 font-medium">Total: {cholesterol.totalCholesterol} mg/dL</div>
            <div className="text-blue-400">HDL: {cholesterol.hdl} mg/dL</div>
            <div className="text-yellow-400">LDL: {cholesterol.ldl} mg/dL</div>
            <div className="text-orange-400">Triglycerides: {cholesterol.triglycerides} mg/dL</div>
          </div>
        </div>
      )}
      
      {/* Display temperature data if available */}
      {temperature && temperature.value > 0 && (
        <div className="absolute top-4 left-4 bg-black/60 p-3 rounded-md shadow-lg border border-gray-700">
          <div className="text-lg font-semibold text-white mb-1">Temperature</div>
          <div className={`text-xl font-medium ${
            temperature.trend === 'rising' ? 'text-red-400' : 
            temperature.trend === 'falling' ? 'text-blue-400' : 
            'text-white'
          }`}>
            {temperature.value.toFixed(1)}°C {temperature.trend === 'rising' ? '↑' : temperature.trend === 'falling' ? '↓' : '→'}
          </div>
          <div className="text-gray-300 text-sm">Location: {temperature.location}</div>
          {temperature.trend === 'rising' && <div className="text-red-400 text-sm mt-1">Temperature increasing</div>}
          {temperature.trend === 'falling' && <div className="text-blue-400 text-sm mt-1">Temperature decreasing</div>}
        </div>
      )}
    </div>
  );
};

export default PPGSignalMeter;

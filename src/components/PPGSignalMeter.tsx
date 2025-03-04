
import React from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Heart } from 'lucide-react';

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
  
  // Helper function to determine color for cholesterol values
  const getCholesterolColor = (value: number, type: 'total' | 'hdl' | 'ldl' | 'triglycerides') => {
    switch (type) {
      case 'total':
        return value > 240 ? 'text-red-500' : value > 200 ? 'text-yellow-500' : 'text-green-500';
      case 'hdl':
        return value < 40 ? 'text-red-500' : value < 60 ? 'text-yellow-500' : 'text-green-500';
      case 'ldl':
        return value > 160 ? 'text-red-500' : value > 130 ? 'text-yellow-500' : 'text-green-500';
      case 'triglycerides':
        return value > 200 ? 'text-red-500' : value > 150 ? 'text-yellow-500' : 'text-green-500';
      default:
        return 'text-white';
    }
  };

  // Helper function for temperature trend icon
  const getTempTrendIcon = () => {
    if (!temperature) return null;
    
    if (temperature.trend === 'rising') {
      return <ArrowUp className="inline text-red-400 ml-1" size={18} />;
    } else if (temperature.trend === 'falling') {
      return <ArrowDown className="inline text-blue-400 ml-1" size={18} />;
    } else {
      return <ArrowRight className="inline text-gray-400 ml-1" size={18} />;
    }
  };
  
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
          <div className="mt-2 text-sm text-amber-400 flex items-center gap-1">
            <Heart size={16} className="text-red-400" />
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
        <div className="absolute top-4 right-4 bg-black/80 p-4 rounded-md shadow-lg border border-gray-700">
          <div className="text-xl font-semibold text-white mb-2 border-b border-gray-700 pb-1">Cholesterol</div>
          <div className="flex flex-col gap-2">
            <div className={`${getCholesterolColor(cholesterol.totalCholesterol, 'total')} font-medium text-base`}>
              Total: {cholesterol.totalCholesterol} mg/dL
            </div>
            <div className={`${getCholesterolColor(cholesterol.hdl, 'hdl')} text-base`}>
              HDL: {cholesterol.hdl} mg/dL
            </div>
            <div className={`${getCholesterolColor(cholesterol.ldl, 'ldl')} text-base`}>
              LDL: {cholesterol.ldl} mg/dL
            </div>
            <div className={`${getCholesterolColor(cholesterol.triglycerides, 'triglycerides')} text-base`}>
              Triglycerides: {cholesterol.triglycerides} mg/dL
            </div>
          </div>
        </div>
      )}
      
      {/* Display temperature data if available */}
      {temperature && temperature.value > 0 && (
        <div className="absolute top-4 left-4 bg-black/80 p-4 rounded-md shadow-lg border border-gray-700">
          <div className="text-xl font-semibold text-white mb-2 border-b border-gray-700 pb-1">Temperature</div>
          <div className={`text-2xl font-medium ${
            temperature.value > 38 ? 'text-red-500' : 
            temperature.value < 36 ? 'text-blue-500' : 
            'text-white'
          }`}>
            {temperature.value.toFixed(1)}°C {getTempTrendIcon()}
          </div>
          <div className="text-gray-300 text-sm mt-1">Location: {temperature.location}</div>
          {temperature.trend === 'rising' && <div className="text-red-400 text-sm mt-2 font-medium">Temperature increasing</div>}
          {temperature.trend === 'falling' && <div className="text-blue-400 text-sm mt-2 font-medium">Temperature decreasing</div>}
          {temperature.confidence && (
            <div className="mt-2 text-xs text-gray-400">
              Confidence: {temperature.confidence}%
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PPGSignalMeter;


import React from 'react';
import { Fingerprint } from 'lucide-react';

interface SignalQualityIndicatorProps {
  quality: number;
  isFingerDetected: boolean;
}

const SignalQualityIndicator: React.FC<SignalQualityIndicatorProps> = ({ 
  quality, 
  isFingerDetected 
}) => {
  const getQualityColor = (q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 75) return 'from-green-500 to-emerald-500';
    if (q > 50) return 'from-yellow-500 to-orange-500';
    if (q > 30) return 'from-orange-500 to-red-500';
    return 'from-red-500 to-rose-500';
  };

  const getQualityText = (q: number) => {
    if (!isFingerDetected) return 'Sin detección';
    if (q > 75) return 'Señal óptima';
    if (q > 50) return 'Señal aceptable';
    if (q > 30) return 'Señal débil';
    return 'Señal muy débil';
  };

  return (
    <div className="absolute top-0 right-1 z-30 flex items-center gap-2 rounded-lg p-2"
         style={{ top: '8px', right: '8px' }}>
      <div className="w-[190px]">
        <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
          <div
            className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
            style={{ width: `${isFingerDetected ? quality : 0}%` }}
          />
        </div>
        <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white" 
              style={{ 
                color: quality > 75 ? '#0EA5E9' : 
                       quality > 50 ? '#F59E0B' : 
                       quality > 30 ? '#DC2626' : '#FF4136' 
              }}>
          {getQualityText(quality)}
        </span>
      </div>

      <div className="flex flex-col items-center">
        <Fingerprint
          className={`h-12 w-12 transition-colors duration-300 ${
            !isFingerDetected ? 'text-gray-400' :
            quality > 75 ? 'text-green-500' :
            quality > 50 ? 'text-yellow-500' :
            quality > 30 ? 'text-orange-500' :
            'text-red-500'
          }`}
          strokeWidth={1.5}
        />
        <span className={`text-[9px] text-center mt-0.5 font-medium ${
          !isFingerDetected ? 'text-gray-400' : 
          quality > 50 ? 'text-green-500' : 'text-yellow-500'
        }`}>
          {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en la Lente"}
        </span>
      </div>
    </div>
  );
};

export default SignalQualityIndicator;

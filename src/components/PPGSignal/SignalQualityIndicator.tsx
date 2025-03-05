
import React, { memo, useMemo } from 'react';
import { Fingerprint } from 'lucide-react';

interface SignalQualityIndicatorProps {
  quality: number;
  isFingerDetected: boolean;
}

const SignalQualityIndicator: React.FC<SignalQualityIndicatorProps> = memo(({ 
  quality, 
  isFingerDetected 
}) => {
  const getQualityColor = useMemo(() => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (quality > 75) return 'from-green-500 to-emerald-500';
    if (quality > 50) return 'from-yellow-500 to-orange-500';
    if (quality > 30) return 'from-orange-500 to-red-500';
    return 'from-red-500 to-rose-500';
  }, [quality, isFingerDetected]);

  const getQualityText = useMemo(() => {
    if (!isFingerDetected) return 'Sin detección';
    if (quality > 75) return 'Señal óptima';
    if (quality > 50) return 'Señal aceptable';
    if (quality > 30) return 'Señal débil';
    return 'Señal muy débil';
  }, [quality, isFingerDetected]);

  const textColor = useMemo(() => {
    if (quality > 75) return '#0EA5E9';
    if (quality > 50) return '#F59E0B';
    if (quality > 30) return '#DC2626';
    return '#FF4136';
  }, [quality]);

  const fingerprintColor = useMemo(() => {
    if (!isFingerDetected) return 'text-gray-400';
    if (quality > 75) return 'text-green-500';
    if (quality > 50) return 'text-yellow-500';
    if (quality > 30) return 'text-orange-500';
    return 'text-red-500';
  }, [quality, isFingerDetected]);

  const statusTextColor = useMemo(() => {
    if (!isFingerDetected) return 'text-gray-400';
    return quality > 50 ? 'text-green-500' : 'text-yellow-500';
  }, [quality, isFingerDetected]);

  return (
    <div className="absolute top-0 right-1 z-30 flex items-center gap-2 rounded-lg p-2"
         style={{ top: '8px', right: '8px' }}>
      <div className="w-[190px]">
        <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor} transition-all duration-1000 ease-in-out`}>
          <div
            className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
            style={{ width: `${isFingerDetected ? quality : 0}%` }}
          />
        </div>
        <span 
          className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white" 
          style={{ color: textColor }}
        >
          {getQualityText}
        </span>
      </div>

      <div className="flex flex-col items-center">
        <Fingerprint
          className={`h-12 w-12 transition-colors duration-300 ${fingerprintColor}`}
          strokeWidth={1.5}
        />
        <span className={`text-[9px] text-center mt-0.5 font-medium ${statusTextColor}`}>
          {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en la Lente"}
        </span>
      </div>
    </div>
  );
});

SignalQualityIndicator.displayName = 'SignalQualityIndicator';

export default SignalQualityIndicator;

import React from 'react';

interface SignalQualityIndicatorProps {
  quality: number;
  isMonitoring?: boolean;
}

const SignalQualityIndicator = ({ quality, isMonitoring = false }: SignalQualityIndicatorProps) => {
  const displayQuality = isMonitoring ? quality : 0;

  const getQualityColor = (quality: number) => {
    if (quality === 0) return '#666666';
    if (quality > 75) return '#00ff00';
    if (quality > 50) return '#ffff00';
    return '#ff0000';
  };

  const getQualityText = (quality: number) => {
    if (quality === 0) return 'Sin Dedo';
    if (quality > 75) return 'Excelente';
    if (quality > 50) return 'Buena';
    return 'Baja';
  };

  return (
    <div className="bg-black/30 backdrop-blur-md rounded p-2 w-full">
      <div className="flex items-center gap-2">
        <div 
          className="w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300"
          style={{
            borderColor: getQualityColor(displayQuality),
            backgroundColor: `${getQualityColor(displayQuality)}33`
          }}
        >
          <span className="text-sm font-bold text-white">{displayQuality}%</span>
        </div>

        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-white/90">Calidad de Señal</span>
            <span 
              className="text-xs font-medium"
              style={{ color: getQualityColor(displayQuality) }}
            >
              {getQualityText(displayQuality)}
            </span>
          </div>

          <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
            <div 
              className="h-full transition-all duration-300"
              style={{
                width: `${displayQuality}%`,
                backgroundColor: getQualityColor(displayQuality)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalQualityIndicator;

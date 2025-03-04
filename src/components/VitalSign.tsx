import React from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

export interface VitalSignProps {
  label: string;
  value: string | number;
  unit: string;
  trend?: 'rising' | 'falling' | 'stable' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  isFinalReading?: boolean;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  cholesterolData?: {
    hdl: number;
    ldl: number;
    triglycerides: number;
    confidence?: number;
  };
}

/**
 * Component for displaying vital sign with trend and quality indication
 * 100% REAL MEASUREMENTS - NO SIMULATION ALLOWED
 */
const VitalSign: React.FC<VitalSignProps> = ({
  label,
  value,
  unit,
  trend = 'stable',
  isFinalReading = false,
  secondaryValue,
  secondaryUnit,
  cholesterolData
}) => {
  const getTrendIcon = () => {
    switch(trend) {
      case 'rising':
        return '↗️';
      case 'falling':
        return '↘️';
      case 'rising_rapidly':
        return '⬆️';
      case 'falling_rapidly':
        return '⬇️';
      case 'stable':
        return '➡️';
      default:
        return '•';
    }
  };

  const getTrendColor = () => {
    switch(trend) {
      case 'rising':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'falling':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'rising_rapidly':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'falling_rapidly':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      case 'stable':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getLipidRiskColor = (type: 'hdl' | 'ldl' | 'tg', value: number) => {
    if (type === 'hdl') {
      if (value >= 60) return 'text-emerald-400';
      if (value >= 40) return 'text-blue-400';
      return 'text-red-400';
    }
    if (type === 'ldl') {
      if (value < 100) return 'text-emerald-400';
      if (value < 130) return 'text-blue-400';
      if (value < 160) return 'text-yellow-400';
      return 'text-red-400';
    }
    // Triglicéridos
    if (value < 150) return 'text-emerald-400';
    if (value < 200) return 'text-blue-400';
    if (value < 500) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <Card className="p-1.5 flex flex-col space-y-0.5 h-[90px] shadow-sm border border-blue-500/20 hover:border-blue-400/30 transition-colors bg-blue-950/40 backdrop-blur-sm">
      <div className="flex justify-between items-start">
        <h3 className="text-[8px] font-semibold text-blue-300/90">{label}</h3>
        {trend && trend !== 'stable' && (
          <Badge variant="outline" className={`text-[7px] px-0.5 py-0 ${getTrendColor()}`}>
            {getTrendIcon()} {trend.replace('_', ' ')}
          </Badge>
        )}
      </div>

      {cholesterolData ? (
        // Vista especial para perfil lipídico
        <div className="flex-1 grid grid-cols-3 gap-0.5 mt-0.5">
          <div className="flex flex-col items-center">
            <span className="text-[7px] text-blue-300/70">HDL</span>
            <span className={`text-[10px] font-bold ${getLipidRiskColor('hdl', cholesterolData.hdl)}`}>
              {cholesterolData.hdl}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[7px] text-blue-300/70">LDL</span>
            <span className={`text-[10px] font-bold ${getLipidRiskColor('ldl', cholesterolData.ldl)}`}>
              {cholesterolData.ldl}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[7px] text-blue-300/70">TG</span>
            <span className={`text-[10px] font-bold ${getLipidRiskColor('tg', cholesterolData.triglycerides)}`}>
              {cholesterolData.triglycerides}
            </span>
          </div>
          <div className="col-span-3 flex justify-center items-baseline mt-0.5">
            <span className="text-base font-bold tracking-tighter text-white">{value}</span>
            <span className="text-[8px] text-blue-300/70 ml-1">{unit}</span>
          </div>
          {cholesterolData.confidence && (
            <div className="col-span-3 flex justify-center">
              <span className="text-[7px] text-blue-300/70">
                Confianza: {Math.round(cholesterolData.confidence)}%
              </span>
            </div>
          )}
        </div>
      ) : (
        // Vista normal para otros signos vitales
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex items-baseline space-x-1 justify-center">
            <span className="text-base font-bold tracking-tighter text-white">{value}</span>
            <span className="text-[8px] text-blue-300/70">{unit}</span>
          </div>
          {secondaryValue && secondaryUnit && (
            <div className="flex items-baseline space-x-1 justify-center">
              <span className="text-xs font-medium tracking-tighter text-blue-200/90">
                {secondaryValue}
              </span>
              <span className="text-[7px] text-blue-300/70">{secondaryUnit}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default VitalSign;

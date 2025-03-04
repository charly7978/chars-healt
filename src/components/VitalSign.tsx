
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
  temperatureLocation?: 'finger' | 'wrist' | 'forehead' | 'unknown';
  temperatureTrend?: 'rising' | 'falling' | 'stable' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  cholesterolData?: {
    hdl: number;
    ldl: number;
    triglycerides: number;
  };
  isWideDisplay?: boolean;
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
  temperatureLocation,
  temperatureTrend,
  cholesterolData,
  isWideDisplay = false
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

  // Pure black background with no border for all cards
  const cardClassName = isWideDisplay 
    ? "p-2 flex flex-col space-y-1 h-full bg-black col-span-2" 
    : "p-2 flex flex-col space-y-1 h-full bg-black";

  return (
    <Card className={cardClassName}>
      <div className="flex justify-between items-start">
        <h3 className="text-xs font-semibold text-white">{label}</h3>
        {trend && (
          <Badge variant="outline" className={`text-[10px] px-1 py-0 ${getTrendColor()}`}>
            {getTrendIcon()} {trend.replace('_', ' ')}
          </Badge>
        )}
      </div>
      
      {isWideDisplay && cholesterolData ? (
        <div className="grid grid-cols-2 gap-2 w-full">
          <div className="flex flex-col">
            <div className="flex items-baseline space-x-1">
              <span className="text-xl font-bold tracking-tighter text-white">{value}</span>
              <span className="text-xs text-gray-400">{unit}</span>
            </div>
            <span className="text-[10px] text-gray-400">Total</span>
          </div>
          
          <div className="flex flex-col space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-gray-400">HDL:</span>
              <span className="text-sm font-medium text-white">{cholesterolData.hdl} mg/dL</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-gray-400">LDL:</span>
              <span className="text-sm font-medium text-white">{cholesterolData.ldl} mg/dL</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-gray-400">TG:</span>
              <span className="text-sm font-medium text-white">{cholesterolData.triglycerides} mg/dL</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-bold tracking-tighter text-white">{value}</span>
            <span className="text-xs text-gray-400">{unit}</span>
          </div>
          {secondaryValue && secondaryUnit && (
            <div className="flex items-baseline space-x-1">
              <span className="text-sm font-medium tracking-tighter text-white">{secondaryValue}</span>
              <span className="text-[10px] text-gray-400">{secondaryUnit}</span>
            </div>
          )}
          {cholesterolData && !isWideDisplay && (
            <div className="flex flex-col mt-1 space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-gray-400">HDL:</span>
                <span className="text-[10px] font-medium text-white">{cholesterolData.hdl} mg/dL</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-gray-400">LDL:</span>
                <span className="text-[10px] font-medium text-white">{cholesterolData.ldl} mg/dL</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-gray-400">TG:</span>
                <span className="text-[10px] font-medium text-white">{cholesterolData.triglycerides} mg/dL</span>
              </div>
            </div>
          )}
          {temperatureLocation && (
            <div className="flex items-baseline space-x-1">
              <span className="text-[10px] text-gray-400">
                {temperatureLocation === 'finger' ? 'Dedo' : 
                 temperatureLocation === 'wrist' ? 'Muñeca' : 
                 temperatureLocation === 'forehead' ? 'Frente' : 'Desconocido'}
              </span>
              {temperatureTrend && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-sky-100 text-sky-800">
                  {getTrendIcon()} {temperatureTrend.replace('_', ' ')}
                </Badge>
              )}
            </div>
          )}
        </>
      )}
      
      {isFinalReading && (
        <div className="mt-auto">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
            Medición Final
          </Badge>
        </div>
      )}
    </Card>
  );
};

export default VitalSign;

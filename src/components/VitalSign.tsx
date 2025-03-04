
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
  secondaryUnit
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

  return (
    <Card className="p-4 flex flex-col space-y-2 h-full shadow-sm border-2 hover:border-blue-300 transition-colors">
      <div className="flex justify-between items-start">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        {trend && (
          <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getTrendColor()}`}>
            {getTrendIcon()} {trend.replace('_', ' ')}
          </Badge>
        )}
      </div>
      <div className="flex items-baseline space-x-1">
        <span className="text-3xl font-bold tracking-tighter">{value}</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">{unit}</span>
      </div>
      {secondaryValue && secondaryUnit && (
        <div className="flex items-baseline space-x-1 mt-1">
          <span className="text-lg font-medium tracking-tighter">{secondaryValue}</span>
          <span className="text-xs text-gray-600 dark:text-gray-400">{secondaryUnit}</span>
        </div>
      )}
      {isFinalReading && (
        <div className="mt-auto">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
            Complete Measurement
          </Badge>
        </div>
      )}
    </Card>
  );
};

export default VitalSign;

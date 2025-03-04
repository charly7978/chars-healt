
import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const valueVariants = cva(
  "font-bold text-center leading-none transition-colors duration-200",
  {
    variants: {
      size: {
        sm: "text-xl",
        md: "text-2xl",
        lg: "text-3xl",
      },
      state: {
        normal: "text-white",
        warning: "text-yellow-400",
        danger: "text-red-500",
        success: "text-green-400"
      }
    },
    defaultVariants: {
      size: "md",
      state: "normal"
    }
  }
);

const labelVariants = cva(
  "text-center font-medium text-xs leading-tight uppercase tracking-wide transition-colors duration-200",
  {
    variants: {
      state: {
        normal: "text-gray-400",
        warning: "text-yellow-400/80",
        danger: "text-red-500/80",
        success: "text-green-400/80"
      }
    },
    defaultVariants: {
      state: "normal"
    }
  }
);

export type ValueState = "normal" | "warning" | "danger" | "success";

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  trend?: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  isFinalReading?: boolean;
  size?: "sm" | "md" | "lg";
  state?: ValueState;
  labelSize?: "xs" | "sm";
  className?: string;
  glucose?: {
    values: number[];
    dates: string[];
  } | null;
}

const VitalSign: React.FC<VitalSignProps> = ({ 
  label, 
  value, 
  unit, 
  secondaryValue, 
  secondaryUnit,
  trend,
  isFinalReading,
  size = "md",
  state = "normal",
  className,
  glucose
}) => {
  return (
    <div className={cn("flex flex-col justify-center items-center p-1 rounded-lg bg-black/30 backdrop-blur-sm", className)}>
      <span className={labelVariants({ state })}>
        {label}
      </span>
      
      <div className="flex items-center justify-center w-full">
        <div className="flex items-baseline justify-center">
          <span className={valueVariants({ size, state })}>
            {value}
          </span>
          
          {unit && (
            <span className="text-xs text-gray-400 ml-1">
              {unit}
            </span>
          )}
          
          {trend && value !== "--" && (
            <span className="ml-1">
              {trend === 'stable' && <span className="text-blue-400">→</span>}
              {trend === 'rising' && <span className="text-yellow-400">↗</span>}
              {trend === 'falling' && <span className="text-yellow-400">↘</span>}
              {trend === 'rising_rapidly' && <span className="text-red-500">⇑</span>}
              {trend === 'falling_rapidly' && <span className="text-red-500">⇓</span>}
            </span>
          )}
        </div>
      </div>
      
      {secondaryValue && (
        <div className="flex items-baseline justify-center mt-1">
          <span className="text-sm font-medium text-gray-300">
            {secondaryValue}
          </span>
          {secondaryUnit && (
            <span className="text-xs text-gray-400 ml-0.5">
              {secondaryUnit}
            </span>
          )}
        </div>
      )}
      
      {isFinalReading && <div className="w-1/3 h-0.5 mt-1 bg-green-400 rounded-full" />}
    </div>
  );
};

export default VitalSign;

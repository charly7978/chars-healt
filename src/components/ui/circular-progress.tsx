
import * as React from "react"
import { cn } from "@/lib/utils"

interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  size?: "sm" | "md" | "lg"
  color?: string
  strokeWidth?: number
  showText?: boolean
}

export const CircularProgress = React.forwardRef<HTMLDivElement, CircularProgressProps>(
  ({ value, max = 100, size = "md", className, color = "#0EA5E9", strokeWidth = 6, showText = false, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100))
    const radius = 50 - strokeWidth / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percentage / 100) * circumference
    
    const sizeMap = {
      sm: "h-6 w-6",
      md: "h-12 w-12",
      lg: "h-24 w-24"
    }
    
    return (
      <div 
        ref={ref}
        className={cn("relative", sizeMap[size], className)}
        {...props}
      >
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth={strokeWidth}
            fill="none"
          />
          
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="transition-all duration-300 ease-in-out"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            fill="none"
            stroke={color}
          />
        </svg>
        
        {showText && (
          <div className="absolute inset-0 flex items-center justify-center text-sm font-medium">
            {Math.round(percentage)}%
          </div>
        )}
      </div>
    )
  }
)

CircularProgress.displayName = "CircularProgress"

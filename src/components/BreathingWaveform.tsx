import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

interface BreathingWaveformProps {
  data: number[];
  height?: number;
  width?: number;
  respirationRate?: number;
  className?: string;
  showAxes?: boolean;
  lineColor?: string;
  backgroundColor?: string;
  lineWidth?: number;
  showSummary?: boolean;
}

/**
 * Componente para visualizar la forma de onda respiratoria
 * Este componente puede ser añadido a una vista detallada o modal
 * sin modificar la pantalla principal.
 */
const BreathingWaveform: React.FC<BreathingWaveformProps> = ({
  data,
  height = 100,
  width = 300,
  respirationRate = 0,
  className,
  showAxes = true,
  lineColor = 'rgba(59, 130, 246, 0.8)',
  backgroundColor = 'rgba(243, 244, 246, 0.2)',
  lineWidth = 2,
  showSummary = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<string>('');
  
  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Limpiar el canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar fondo
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Dibujar ejes si se solicitan
    if (showAxes) {
      const axisColor = 'rgba(156, 163, 175, 0.5)';
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1;
      
      // Eje horizontal (línea central)
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      
      // Líneas de cuadrícula horizontal (opcional)
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.moveTo(0, canvas.height / 4);
      ctx.lineTo(canvas.width, canvas.height / 4);
      ctx.moveTo(0, canvas.height * 3 / 4);
      ctx.lineTo(canvas.width, canvas.height * 3 / 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Preparar el dibujo de la forma de onda
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    
    // Normalizar los datos para dibujar
    const normalizedData = normalizeData(data);
    
    // Calcular el escalado horizontal
    const xScale = canvas.width / (normalizedData.length - 1);
    
    // Dibujar la forma de onda
    normalizedData.forEach((value, index) => {
      const x = index * xScale;
      const y = (1 - value) * canvas.height; // Invertir y, 0 = arriba, 1 = abajo
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Analizar patrón y establecer estado
    analyzeBreathingPattern(data);
  }, [data, height, width, lineColor, backgroundColor, lineWidth, showAxes]);
  
  // Normalizar datos al rango 0-1
  const normalizeData = (dataArray: number[]): number[] => {
    if (dataArray.length === 0) return [];
    
    const min = Math.min(...dataArray);
    const max = Math.max(...dataArray);
    
    if (max === min) return dataArray.map(() => 0.5);
    
    return dataArray.map(value => 
      (value - min) / (max - min)
    );
  };
  
  // Analizar patrón respiratorio basado en la forma de onda
  const analyzeBreathingPattern = (dataArray: number[]): void => {
    if (dataArray.length < 10) {
      setStatus('Insuficientes datos');
      return;
    }
    
    try {
      // Contar cruces por cero para estimar ciclos
      let crossings = 0;
      const normalizedData = normalizeData(dataArray);
      const meanValue = normalizedData.reduce((sum, val) => sum + val, 0) / normalizedData.length;
      
      for (let i = 1; i < normalizedData.length; i++) {
        if ((normalizedData[i-1] <= meanValue && normalizedData[i] > meanValue) ||
            (normalizedData[i-1] >= meanValue && normalizedData[i] < meanValue)) {
          crossings++;
        }
      }
      
      // Calcular variabilidad
      const diffs = [];
      for (let i = 1; i < dataArray.length; i++) {
        diffs.push(Math.abs(dataArray[i] - dataArray[i-1]));
      }
      
      const avgDiff = diffs.reduce((sum, val) => sum + val, 0) / diffs.length;
      const sqDiffs = diffs.map(diff => Math.pow(diff - avgDiff, 2));
      const variance = sqDiffs.reduce((sum, val) => sum + val, 0) / sqDiffs.length;
      const stdDev = Math.sqrt(variance);
      const cv = avgDiff > 0 ? stdDev / avgDiff : 0;
      
      // Evaluar patrón
      if (crossings === 0) {
        setStatus('Sin respiración detectada');
      } else if (cv > 0.7) {
        setStatus('Patrón irregular');
      } else if (respirationRate > 20) {
        setStatus('Respiración rápida');
      } else if (respirationRate < 12) {
        setStatus('Respiración lenta');
      } else {
        setStatus('Patrón normal');
      }
    } catch (error) {
      console.error('Error analizando patrón respiratorio:', error);
      setStatus('Error de análisis');
    }
  };
  
  return (
    <div className={cn(
      "flex flex-col rounded-lg overflow-hidden", 
      className
    )}>
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height}
        className="w-full"
      />
      
      {showSummary && (
        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
          <span>{respirationRate > 0 ? `${respirationRate} resp/min` : 'Sin datos'}</span>
          <span>{status}</span>
        </div>
      )}
    </div>
  );
};

export default BreathingWaveform; 
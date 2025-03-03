import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';
import { Button } from '@/components/ui/button';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  respirationRate?: number;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
    isPrematureBeat?: boolean;
    confidence?: number;
  } | null;
}

// Duración máxima del historial en milisegundos (7 segundos)
const MAX_HISTORY_DURATION = 7000;
const MAX_BUFFER_SIZE = 800;

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  respirationRate,
  rawArrhythmiaData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<CircularBuffer>(new CircularBuffer(MAX_BUFFER_SIZE));
  const [showArrhythmiaAlert, setShowArrhythmiaAlert] = useState(false);
  const lastDrawTimeRef = useRef<number>(0);
  const respirationBufferRef = useRef<number[]>([]);
  const [arrhythmiaCount, setArrhythmiaCount] = useState(0);

  // Efecto para detectar y actualizar arritmias
  useEffect(() => {
    if (arrhythmiaStatus) {
      const parts = arrhythmiaStatus.split('|');
      if (parts.length === 2) {
        const count = parseInt(parts[1], 10);
        if (!isNaN(count) && count !== arrhythmiaCount) {
          setArrhythmiaCount(count);
          if (count > 0) {
            setShowArrhythmiaAlert(true);
            setTimeout(() => setShowArrhythmiaAlert(false), 2000);
          }
        }
      }
    }
  }, [arrhythmiaStatus, arrhythmiaCount]);

  // Efecto para procesar la señal
  useEffect(() => {
    if (!isFingerDetected || !value) return;

    const now = Date.now();
    const isArrhythmia = rawArrhythmiaData?.isPrematureBeat || false;
    
    bufferRef.current.push({
      time: now,
      value,
      isArrhythmia
    });

    // Actualizar buffer de respiración
    if (respirationRate) {
      respirationBufferRef.current.push(respirationRate);
      if (respirationBufferRef.current.length > 60) { // 2 segundos a 30fps
        respirationBufferRef.current.shift();
      }
    }

    // Limitar velocidad de renderizado
    const currentTime = performance.now();
    if (currentTime - lastDrawTimeRef.current > 16) { // ~60 FPS
      drawWaveform();
      lastDrawTimeRef.current = currentTime;
    }
  }, [value, isFingerDetected, rawArrhythmiaData, respirationRate]);

  // Limpiar buffers cuando cambia la detección del dedo
  useEffect(() => {
    if (!isFingerDetected) {
      bufferRef.current.clear();
      respirationBufferRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [isFingerDetected]);

  // Función mejorada para dibujar la forma de onda
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajustar tamaño del canvas
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    // Limpiar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibujar fondo con gradiente
    const gradientBg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradientBg.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    gradientBg.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = gradientBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar cuadrícula
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Líneas verticales
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Líneas horizontales
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const points = bufferRef.current.getPoints();
    if (points.length < 2) return;

    // Filtrar puntos por tiempo
    const now = Date.now();
    const timeFiltered = points.filter(p => now - p.time < MAX_HISTORY_DURATION);
    if (timeFiltered.length < 2) return;

    // Encontrar min y max para escalar
    let minValue = Number.MAX_VALUE;
    let maxValue = Number.MIN_VALUE;
    for (const point of timeFiltered) {
      if (point.value < minValue) minValue = point.value;
      if (point.value > maxValue) maxValue = point.value;
    }

    // Añadir margen
    const range = maxValue - minValue;
    minValue -= range * 0.2;
    maxValue += range * 0.2;

    // Dibujar línea de referencia
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Función para obtener color basado en calidad
    const getQualityColor = (quality: number) => {
      if (quality < 30) return 'rgba(255, 0, 0, 0.8)';
      if (quality < 60) return 'rgba(255, 165, 0, 0.8)';
      return 'rgba(0, 255, 0, 0.8)';
    };

    // Dibujar señal PPG con efecto de sombra
    ctx.shadowBlur = 5;
    ctx.shadowColor = getQualityColor(quality);
    ctx.lineWidth = 2;
    ctx.strokeStyle = getQualityColor(quality);
    ctx.beginPath();

    let lastX = 0;
    let lastY = 0;
    let firstPoint = true;

    timeFiltered.forEach((point, index) => {
      const x = canvas.width - ((now - point.time) / MAX_HISTORY_DURATION) * canvas.width;
      const normalizedValue = (point.value - minValue) / (maxValue - minValue);
      const y = canvas.height - (normalizedValue * canvas.height * 0.8 + canvas.height * 0.1);

      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        // Curva suave entre puntos
        const cp1x = (lastX + x) / 2;
        const cp1y = lastY;
        const cp2x = (lastX + x) / 2;
        const cp2y = y;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);

        // Marcar arritmias
        if (point.isArrhythmia) {
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x, y);
        }
      }
      
      lastX = x;
      lastY = y;
    });

    ctx.stroke();

    // Dibujar tasa respiratoria si está disponible
    if (respirationBufferRef.current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      
      const respPoints = respirationBufferRef.current;
      const respHeight = canvas.height * 0.2; // 20% de la altura para la respiración
      
      respPoints.forEach((rate, index) => {
        const x = (index / respPoints.length) * canvas.width;
        const y = canvas.height - (rate / 30) * respHeight; // Normalizar a 30 resp/min max
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }

  }, [quality]);

  // Botón de control
  const getActionButton = () => {
    if (!isFingerDetected) {
      return (
        <Button 
          onClick={onStartMeasurement}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold"
        >
          Iniciar Medición
        </Button>
      );
    }
    
    return (
      <Button 
        onClick={onReset}
        variant="destructive"
        className="bg-red-500 hover:bg-red-600 text-white font-bold"
      >
        Detener
      </Button>
    );
  };

  return (
    <div className="relative rounded-xl shadow-xl overflow-hidden border border-gray-800 bg-gray-900">
      <div className="relative h-44 w-full">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
        />
        
        {/* Indicadores de estado */}
        <div className="absolute inset-x-0 top-2 flex items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <div 
              className={`h-3 w-3 rounded-full ${isFingerDetected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-xs font-medium text-white">
              {isFingerDetected ? 'Dedo detectado' : 'Coloque su dedo en la cámara'}
            </span>
          </div>
          
          {/* Indicador de calidad */}
          <div className="flex items-center bg-black/30 px-2 py-1 rounded-full">
            <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  quality > 70 ? 'bg-green-500' : 
                  quality > 40 ? 'bg-orange-500' : 
                  'bg-red-500'
                }`}
                style={{ width: `${quality}%` }}
              />
            </div>
            <span className="text-xs font-medium text-white ml-2">{quality}%</span>
          </div>
        </div>
        
        {/* Alerta de arritmia */}
        {showArrhythmiaAlert && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-500/80 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
              ¡Arritmia Detectada!
            </div>
          </div>
        )}
        
        {/* Contador de arritmias */}
        {arrhythmiaCount > 0 && (
          <div className="absolute bottom-4 right-4 bg-red-500/80 text-white px-3 py-1 rounded-full text-sm font-bold">
            Arritmias: {arrhythmiaCount}
          </div>
        )}
        
        {/* Tasa respiratoria */}
        {respirationRate && respirationRate > 0 && (
          <div className="absolute bottom-4 left-4 bg-cyan-500/80 text-white px-3 py-1 rounded-full text-sm font-bold">
            Resp: {Math.round(respirationRate)} /min
          </div>
        )}
      </div>
      
      {/* Botones de acción */}
      <div className="p-3 bg-black/50 flex justify-center">
        {getActionButton()}
      </div>
    </div>
  );
};

export default React.memo(PPGSignalMeter);

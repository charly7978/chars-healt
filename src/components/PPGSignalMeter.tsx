
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Fingerprint, ActivitySquare, Zap } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  isCalibrating?: boolean;
  calibrationProgress?: number;
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({
  value,
  quality,
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus = '--',
  rawArrhythmiaData = null,
  isCalibrating = false,
  calibrationProgress = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer<PPGDataPoint>>(new CircularBuffer<PPGDataPoint>(150));
  const peakBufferRef = useRef<PPGDataPoint[]>([]);
  const [displayMode, setDisplayMode] = useState<'normal' | 'ecg'>('normal');
  const [timeScale, setTimeScale] = useState<number>(1.5);
  const [showEcgOverlay, setShowEcgOverlay] = useState<boolean>(false);
  const [peakValues, setPeakValues] = useState<{ max: number, avg: number, min: number }>({ max: 0, avg: 0, min: 0 });
  
  // Variables para tracking de picos y valles
  const lastPeakTimeRef = useRef<number | null>(null);
  const lastValleyTimeRef = useRef<number | null>(null);
  const lastPeakValueRef = useRef<number>(0);
  const lastValleyValueRef = useRef<number>(0);
  const smoothedValueRef = useRef<number>(0);
  const isPeakRef = useRef<boolean>(false);
  const peakThresholdRef = useRef<number>(20);
  const baselineRef = useRef<number>(0);
  const signalRangeRef = useRef<{ min: number, max: number }>({ min: 0, max: 0 });
  
  // Estado para mostrar texto descriptivo
  const [infoText, setInfoText] = useState<string>('');
  
  // Colores para el modo ECG
  const ecgColors = {
    grid: 'rgba(0, 255, 0, 0.1)',
    trace: 'rgba(0, 200, 0, 1)',
    peak: 'rgba(255, 255, 0, 0.8)',
    text: 'rgba(200, 255, 200, 0.9)',
  };
  
  // Colores para el modo normal
  const normalColors = {
    grid: 'rgba(100, 100, 100, 0.1)',
    trace: 'rgba(0, 150, 255, 1)',
    peak: 'rgba(255, 100, 100, 0.8)',
    text: 'rgba(200, 200, 200, 0.9)',
  };
  
  // Referencias para arrhythmia detection
  const arrhythmiaRef = useRef<{
    isArrhythmia: boolean;
    lastArrhythmiaTime: number | null;
    affectedPoints: number[];
  }>({
    isArrhythmia: false,
    lastArrhythmiaTime: null,
    affectedPoints: []
  });
  
  // Detect arrhythmia based on the status
  useEffect(() => {
    if (!arrhythmiaStatus) return;
    
    const isArrhythmia = arrhythmiaStatus.includes('ARRITMIA');
    arrhythmiaRef.current.isArrhythmia = isArrhythmia;
    
    if (isArrhythmia && rawArrhythmiaData) {
      arrhythmiaRef.current.lastArrhythmiaTime = rawArrhythmiaData.timestamp;
      arrhythmiaRef.current.affectedPoints = [];
      
      // Calculate how many points to highlight
      const currentTime = Date.now();
      const timeSinceArrhythmia = currentTime - rawArrhythmiaData.timestamp;
      const pointsToHighlight = Math.min(30, Math.max(10, Math.floor(timeSinceArrhythmia / 50)));
      
      for (let i = 0; i < pointsToHighlight; i++) {
        arrhythmiaRef.current.affectedPoints.push(i);
      }
    }
  }, [arrhythmiaStatus, rawArrhythmiaData]);
  
  const detectPeaks = useCallback((value: number, timestamp: number) => {
    try {
      // Simple smooth with exponential moving average
      const alpha = 0.3; // Smoothing factor
      smoothedValueRef.current = alpha * value + (1 - alpha) * smoothedValueRef.current;
      
      // Initialize baseline if not set
      if (baselineRef.current === 0) {
        baselineRef.current = smoothedValueRef.current;
      }
      
      // Adaptively update baseline
      const baselineAdaptRate = 0.01;
      baselineRef.current = baselineRef.current * (1 - baselineAdaptRate) + smoothedValueRef.current * baselineAdaptRate;
      
      // Adaptively update signal range
      if (signalRangeRef.current.min === 0 || smoothedValueRef.current < signalRangeRef.current.min) {
        signalRangeRef.current.min = smoothedValueRef.current;
      }
      
      if (signalRangeRef.current.max === 0 || smoothedValueRef.current > signalRangeRef.current.max) {
        signalRangeRef.current.max = smoothedValueRef.current;
      }
      
      // Calculate adaptive threshold based on signal range
      const range = signalRangeRef.current.max - signalRangeRef.current.min;
      peakThresholdRef.current = Math.max(5, range * 0.15); // At least 5, or 15% of range
      
      // Detect peak
      const isPeak = !isPeakRef.current && 
                    smoothedValueRef.current > baselineRef.current + peakThresholdRef.current && 
                    smoothedValueRef.current > lastPeakValueRef.current * 0.8;
      
      // Detect valley (for improved peak detection)
      const isValley = isPeakRef.current && 
                      smoothedValueRef.current < baselineRef.current && 
                      smoothedValueRef.current < lastValleyValueRef.current * 1.2;
      
      if (isPeak) {
        // It's a peak
        isPeakRef.current = true;
        lastPeakValueRef.current = smoothedValueRef.current;
        lastPeakTimeRef.current = timestamp;
        
        // Store peak for visualization
        if (peakBufferRef.current.length >= 10) {
          peakBufferRef.current.shift();
        }
        
        peakBufferRef.current.push({
          value: smoothedValueRef.current,
          timestamp,
          isPeak: true
        });
        
        // Update peak values statistics
        const peakValues = peakBufferRef.current.map(p => p.value);
        if (peakValues.length > 0) {
          const max = Math.max(...peakValues);
          const min = Math.min(...peakValues);
          const avg = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
          
          setPeakValues({
            max: Math.round(max),
            avg: Math.round(avg),
            min: Math.round(min)
          });
        }
      } else if (isValley) {
        // It's a valley
        isPeakRef.current = false;
        lastValleyValueRef.current = smoothedValueRef.current;
        lastValleyTimeRef.current = timestamp;
      }
      
      return {
        isPeak,
        isValley,
        smoothedValue: smoothedValueRef.current
      };
    } catch (error) {
      console.error('Error detecting peaks:', error);
      return {
        isPeak: false,
        isValley: false,
        smoothedValue: value
      };
    }
  }, []);
  
  // Render the signal visualization
  const renderSignal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const currentTime = Date.now();
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Choose colors based on display mode
    const colors = displayMode === 'normal' ? normalColors : ecgColors;
    
    // Draw grid lines
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    
    const gridSize = 20;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw time markers if in ECG mode
    if (displayMode === 'ecg') {
      ctx.fillStyle = colors.text;
      ctx.font = '10px sans-serif';
      for (let x = 0; x < width; x += gridSize * 4) {
        const timeMs = x * (timeScale * 40);
        const timeText = `${Math.round(timeMs/1000 * 10) / 10}s`;
        ctx.fillText(timeText, x, height - 5);
      }
    }
    
    // Draw finger detection status
    ctx.fillStyle = isFingerDetected ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
    ctx.font = '14px sans-serif';
    ctx.fillText(isFingerDetected ? 'Dedo detectado' : 'Sin detección', width / 2 - 50, 20);
    
    // Get data points from buffer
    const dataPoints = dataBufferRef.current.getAll();
    if (dataPoints.length < 2) return;
    
    // If in ECG mode, transform the signal
    let renderPoints: { x: number, y: number, isPeak: boolean, isArrhythmia: boolean }[] = [];
    
    dataPoints.forEach((point, index) => {
      const timeDelta = currentTime - point.timestamp;
      const x = width - (timeDelta / (timeScale * 40));
      
      // Skip points outside visible area
      if (x < 0) return;
      
      let y;
      if (displayMode === 'ecg') {
        // Transform PPG to ECG-like visualization
        y = height / 2;
        
        if (point.isPeak) {
          // Add QRS complex like visualization for peaks
          const peakHeight = height * 0.4;
          y = height / 2 + peakHeight;
        } else {
          // Create a baseline with small variations
          const baseNoise = Math.sin(index * 0.1) * (height * 0.05);
          y = height / 2 + baseNoise;
        }
      } else {
        // Normal PPG mode - scale to fit within canvas
        const range = Math.max(100, signalRangeRef.current.max - signalRangeRef.current.min);
        const normalizedValue = (point.value - signalRangeRef.current.min) / range;
        y = height - (normalizedValue * height * 0.8) - (height * 0.1);
      }
      
      // Check if this point is affected by arrhythmia
      const isArrhythmiaPoint = arrhythmiaRef.current.isArrhythmia && 
                               arrhythmiaRef.current.lastArrhythmiaTime &&
                               arrhythmiaRef.current.affectedPoints.includes(index);
      
      renderPoints.push({
        x,
        y,
        isPeak: point.isPeak,
        isArrhythmia: isArrhythmiaPoint
      });
    });
    
    // Sort points by x for proper drawing
    renderPoints.sort((a, b) => a.x - b.x);
    
    // Draw signal trace with improved styling
    if (renderPoints.length > 1) {
      // Normal signal trace
      ctx.strokeStyle = colors.trace;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      let currentArrhythmiaSection = false;
      let arrhythmiaStartIndex = -1;
      
      renderPoints.forEach((point, index) => {
        // Start a new path for arrhythmia sections
        if (point.isArrhythmia !== currentArrhythmiaSection) {
          if (index > 0) {
            ctx.stroke(); // End current path
            ctx.beginPath();
            
            // Start from the last point to avoid gaps
            const lastPoint = renderPoints[index - 1];
            ctx.moveTo(lastPoint.x, lastPoint.y);
          }
          
          // Update style for arrhythmia sections
          if (point.isArrhythmia) {
            ctx.strokeStyle = 'rgba(255, 60, 60, 1)';
            ctx.lineWidth = 3;
            arrhythmiaStartIndex = index;
          } else {
            ctx.strokeStyle = colors.trace;
            ctx.lineWidth = 2;
          }
          
          currentArrhythmiaSection = point.isArrhythmia;
        }
        
        if (index === 0 || point.x <= 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      
      ctx.stroke();
      
      // Highlight arrhythmia section with glow if needed
      if (arrhythmiaStartIndex >= 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
        ctx.lineWidth = 6;
        ctx.shadowColor = 'rgba(255, 30, 30, 0.8)';
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        
        // Draw only the arrhythmia section with glow
        for (let i = arrhythmiaStartIndex; i < renderPoints.length; i++) {
          const point = renderPoints[i];
          if (!point.isArrhythmia) break;
          
          if (i === arrhythmiaStartIndex) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }
        
        ctx.stroke();
        ctx.restore();
      }
    }
    
    // Mark peaks with circles
    renderPoints.forEach(point => {
      if (point.isPeak) {
        ctx.fillStyle = point.isArrhythmia ? 'rgba(255, 50, 50, 0.8)' : colors.peak;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Show peak statistics
    if (peakValues.max > 0) {
      ctx.fillStyle = colors.text;
      ctx.font = '12px sans-serif';
      ctx.fillText(`Pico: ${peakValues.max} | Avg: ${peakValues.avg} | Min: ${peakValues.min}`, 10, height - 10);
    }
    
    // Draw signal quality indicator
    const qualityText = `Calidad: ${Math.round(quality)}%`;
    ctx.fillStyle = quality > 80 ? 'rgba(0, 255, 0, 0.8)' : 
                   quality > 50 ? 'rgba(255, 255, 0, 0.8)' : 
                   'rgba(255, 0, 0, 0.8)';
    ctx.font = '12px sans-serif';
    ctx.fillText(qualityText, width - 100, 20);
    
    // Show calibration progress if calibrating
    if (isCalibrating) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Calibrando... ${Math.round(calibrationProgress)}%`, width / 2 - 70, 40);
      
      // Draw progress bar
      const barWidth = 200;
      const barHeight = 10;
      const barX = (width - barWidth) / 2;
      const barY = 50;
      
      // Background
      ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // Progress
      ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.fillRect(barX, barY, barWidth * (calibrationProgress / 100), barHeight);
    }
    
    // Show info text if any
    if (infoText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '14px sans-serif';
      ctx.fillText(infoText, 10, 20);
    }
    
  }, [value, isFingerDetected, quality, displayMode, timeScale, peakValues, isCalibrating, calibrationProgress, infoText, normalColors, ecgColors]);
  
  // Setup canvas and initial data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas dimensions based on parent container
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    
    // Initial resize
    resizeCanvas();
    
    // Resize on window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Setup animation frame for continuous rendering
    let animationFrameId: number;
    
    const animate = () => {
      renderSignal();
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [renderSignal]);
  
  // Process incoming signal values
  useEffect(() => {
    if (value !== 0) {
      const timestamp = Date.now();
      const { isPeak, smoothedValue } = detectPeaks(value, timestamp);
      
      // Color status text based on arrhythmia status
      let arrhythmiaColor = '#FFFFFF';
      let arrhythmiaText = arrhythmiaStatus;
      
      if (arrhythmiaStatus && arrhythmiaStatus.includes('ARRITMIA')) {
        arrhythmiaColor = '#FF3C3C';
        arrhythmiaText = 'ARRITMIA DETECTADA';
      } else if (arrhythmiaStatus && arrhythmiaStatus.includes('SIN')) {
        arrhythmiaColor = '#3CFF3C';
        arrhythmiaText = 'RITMO NORMAL';
      } else if (arrhythmiaStatus && arrhythmiaStatus.includes('CALIBRANDO')) {
        arrhythmiaColor = '#3CFFFF';
        arrhythmiaText = arrhythmiaStatus.split('|')[0];
      }
      
      // Add point to buffer
      dataBufferRef.current.push({
        value: smoothedValue,
        timestamp,
        isPeak,
        auxData: {
          arrhythmiaStatus: arrhythmiaText,
          arrhythmiaColor
        }
      });
    }
  }, [value, arrhythmiaStatus, detectPeaks]);
  
  // Toggle display mode
  const toggleDisplayMode = () => {
    setDisplayMode(prev => prev === 'normal' ? 'ecg' : 'normal');
    setInfoText(`Modo: ${displayMode === 'normal' ? 'ECG' : 'Normal'}`);
    
    // Clear info text after 2 seconds
    setTimeout(() => {
      setInfoText('');
    }, 2000);
  };
  
  // Adjust time scale
  const adjustTimeScale = (direction: 'increase' | 'decrease') => {
    setTimeScale(prev => {
      const newScale = direction === 'increase' 
        ? Math.min(prev * 1.2, 3.0)
        : Math.max(prev / 1.2, 0.5);
      
      setInfoText(`Escala: ${newScale.toFixed(1)}x`);
      
      // Clear info text after 2 seconds
      setTimeout(() => {
        setInfoText('');
      }, 2000);
      
      return newScale;
    });
  };
  
  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="relative flex-1">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full" 
        />
        
        {/* Display mode control */}
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={toggleDisplayMode}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 text-white"
          >
            {displayMode === 'normal' ? <ActivitySquare size={20} /> : <Zap size={20} />}
          </button>
        </div>
        
        {/* Time scale controls */}
        <div className="absolute top-14 right-2 z-10 flex flex-col gap-2">
          <button
            onClick={() => adjustTimeScale('increase')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 text-white"
          >
            +
          </button>
          <button
            onClick={() => adjustTimeScale('decrease')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 text-white"
          >
            -
          </button>
        </div>
      </div>
      
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
        {!isFingerDetected && (
          <div className="flex flex-col items-center">
            <Fingerprint size={48} className="text-gray-400 mb-2" />
            <p className="text-gray-300 text-lg">Ubique su dedo en la lente</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PPGSignalMeter;

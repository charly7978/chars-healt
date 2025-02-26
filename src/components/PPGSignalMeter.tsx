import React, { useRef, useEffect, useState } from 'react';
import { Line } from 'recharts';
import { Area } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { scaleLinear } from '@visx/scale';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus: string;
  rawArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const width = 320;
const height = 200;

const gridLines = Array.from({ length: 5 }, (_, i) => (height / 4) * i);

const signalData = Array.from({ length: width }, (_, i) => ({
  x: i,
  y: 0,
}));

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({
  value,
  quality,
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}) => {
  const [data, setData] = useState(signalData);
  const dataIndex = useRef(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    setData(prevData => {
      const newData = [...prevData];
      newData[dataIndex.current] = { x: dataIndex.current, y: value };
      dataIndex.current = (dataIndex.current + 1) % width;
      return newData;
    });
  }, [value]);

  const xScale = scaleLinear({
    domain: [0, width],
    range: [0, width],
  });

  const yScale = scaleLinear({
    domain: [-100, 100],
    range: [height, 0],
  });

  const handleStart = () => {
    setIsFlipped(true);
    setTimeout(() => {
      onStartMeasurement();
    }, 750);
  };

  const handleResetAction = () => {
    setIsFlipped(false);
    onReset();
  };

  return (
    <div className="relative w-full h-full">
      {/* Contenedor principal ajustado */}
      <div className="absolute inset-0 flex flex-col">
        {/* Ajustamos el margin-top aquí para bajar sutilmente los displays */}
        <div className="relative mt-6 flex-1">
          {/* Grid y líneas de fondo */}
          <svg
            className="w-full h-full"
            preserveAspectRatio="none"
            viewBox={`0 0 ${width} ${height}`}
          >
            {gridLines.map(y => (
              <line
                key={y}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth={1}
              />
            ))}
            <line
              x1={width / 2}
              y1={0}
              x2={width / 2}
              y2={height}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          </svg>

          {/* Señal PPG */}
          <svg
            className="absolute inset-0"
            preserveAspectRatio="none"
            viewBox={`0 0 ${width} ${height}`}
          >
            <Area
              data={data}
              x={d => xScale(d.x) || 0}
              y0={height}
              y1={d => yScale(d.y) || 0}
              stroke="rgb(100, 200, 255)"
              strokeWidth={2}
              fill="rgba(100, 200, 255, 0.3)"
              curve={curveMonotoneX}
            />
          </svg>
        </div>

        {/* Indicadores y controles */}
        <div className="absolute top-0 left-0 right-0 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-heart-beat" />
              <span className="text-white/80 text-sm">
                {isFingerDetected ? 'Dedo detectado' : 'Sin dedo'}
              </span>
            </div>
            <div className="text-white/60 text-sm">Calidad: {quality}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PPGSignalMeter;

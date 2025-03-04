import React, { useEffect, useRef, useState } from 'react';
import { Line } from 'recharts';
import SignalQualityIndicator from './SignalQualityIndicator';

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
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({
  value,
  quality,
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}) => {
  const [data, setData] = useState([{ time: 0, value: 0 }]);
  const [time, setTime] = useState(0);
  const chartRef = useRef(null);
  const [isAtRisk, setIsAtRisk] = useState(false);
  const [riskMessage, setRiskMessage] = useState('');

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTime((prevTime) => prevTime + 1);
      setData((prevData) => {
        const newData = [...prevData, { time: time + 1, value: value }];
        if (newData.length > 100) {
          newData.shift();
        }
        return newData;
      });
    }, 50);

    return () => clearInterval(intervalId);
  }, [value, time]);

  useEffect(() => {
    if (arrhythmiaStatus && arrhythmiaStatus !== "--") {
      const [status, count] = arrhythmiaStatus.split('|');
      if (status === 'At Risk' && parseInt(count, 10) > 0) {
        setIsAtRisk(true);
        setRiskMessage(`¡${count} Arritmias detectadas!`);
      } else {
        setIsAtRisk(false);
        setRiskMessage('');
      }
    } else {
      setIsAtRisk(false);
      setRiskMessage('');
    }
  }, [arrhythmiaStatus]);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="absolute top-1 left-0 right-0 z-20 flex justify-center">
        <h1 className="text-center text-lg font-bold text-white bg-black/40 px-4 py-1 rounded-full backdrop-blur-sm">
          <span className="text-blue-400">charts</span>
          <span className="text-green-400">Health</span>
        </h1>
      </div>
      
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full h-full relative">
          <div className="absolute top-2 left-2 z-10">
            <SignalQualityIndicator quality={quality} isFingerDetected={isFingerDetected} />
          </div>
          <div className="absolute top-2 right-2 z-10">
            {isFingerDetected ? (
              <span className="text-green-400 font-bold text-xs bg-black/50 px-2 py-1 rounded-full">
                DEDO DETECTADO
              </span>
            ) : (
              <span className="text-red-400 font-bold text-xs bg-black/50 px-2 py-1 rounded-full">
                NO SE DETECTA DEDO
              </span>
            )}
          </div>
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              overflow: 'hidden',
            }}
          >
            <Line
              type="monotone"
              data={data}
              dataKey="value"
              stroke="#34D399"
              strokeWidth={2}
              dot={false}
              ref={chartRef}
              animationDuration={0}
              style={{
                width: '100%',
                height: '100%',
              }}
              className="mx-auto"
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-2 left-0 right-0 flex justify-center z-20">
        {isAtRisk && (
          <div className="bg-red-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-md">
            {riskMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default PPGSignalMeter;

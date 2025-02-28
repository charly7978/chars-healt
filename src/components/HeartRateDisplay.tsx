
interface HeartRateDisplayProps {
  bpm: number;
  confidence?: number;
  isActive?: boolean;
}

const HeartRateDisplay = ({ bpm, confidence = 1, isActive = false }: HeartRateDisplayProps) => {
  const isReliable = confidence > 0.5;
  const shouldDisplay = isActive || bpm > 0;

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-3 text-center">
      <h3 className="text-gray-400/90 text-sm mb-1">Heart Rate</h3>
      <div className="flex items-baseline justify-center gap-1">
        <span className={`text-2xl font-bold ${shouldDisplay ? (isReliable ? 'text-white/90' : 'text-gray-500') : 'text-gray-500'}`}>
          {bpm > 0 ? bpm : '--'}
        </span>
        <span className="text-gray-400/90 text-xs">BPM</span>
      </div>
    </div>
  );
};

export default HeartRateDisplay;

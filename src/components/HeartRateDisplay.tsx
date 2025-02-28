interface HeartRateDisplayProps {
  bpm: number;
  confidence: number;
}

const HeartRateDisplay = ({ bpm, confidence }: HeartRateDisplayProps) => {
  const isReliable = confidence > 0.5;

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-3 text-center">
      <h3 className="text-gray-400/90 text-sm mb-1">Heart Rate</h3>
      <div className="flex items-baseline justify-center gap-1">
        <span className={`text-2xl font-bold ${isReliable ? 'text-white/90' : 'text-gray-500'}`}>
          {bpm > 0 ? bpm : '--'}
        </span>
        <span className="text-gray-400/90 text-xs">BPM</span>
      </div>
    </div>
  );
};

export default HeartRateDisplay;

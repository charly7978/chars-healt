
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "Arrhythmias";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    const [status, count] = value.toString().split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: `ARRITMIA DETECTADA (${count})`,
        color: "text-medical-red"
      };
    }
    
    return {
      text: "SIN ARRITMIAS (0)",
      color: "text-[#0FA0CE]"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  const getAnimationClass = () => {
    if (isArrhythmiaDisplay) {
      return status === "ARRITMIA DETECTADA" ? "animate-pulse" : "animate-none";
    }
    
    if (label === "Heart Rate") {
      return "animate-[heart-beat_1.5s_ease-in-out_infinite]";
    }
    
    if (label === "SpO2") {
      return "animate-[progress_3s_linear_infinite]";
    }
    
    return "animate-[equalize_2s_ease-in-out_infinite]";
  };

  return (
    <div className={`bg-gray-800/60 backdrop-blur-md rounded-lg p-3 w-[160px] transition-all duration-300 hover:bg-gray-800/80 group`}>
      <h3 className="text-gray-400/90 text-xs uppercase tracking-wider mb-1 group-hover:text-white/90 transition-colors">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center relative overflow-hidden">
        <div className={`w-full h-full absolute inset-0 ${getAnimationClass()} bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
        <span className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-2xl'} font-bold ${color || 'text-white/90'} relative z-10`}>
          {text}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-xs relative z-10 group-hover:text-white/75 transition-colors">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;

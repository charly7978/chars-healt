
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "ARRITMIAS";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIA (${count})` : "ARRITMIA DETECTADA",
        color: "text-medical-red"
      };
    }
    
    return {
      text: "SIN ARRITMIAS",
      color: "text-[#0FA0CE]"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="bg-gray-800/20 backdrop-blur-md rounded p-2.5 min-w-[140px] relative overflow-hidden group">
      {/* Efecto de brillo ambiental */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 
                    transform translate-x-[-200%] group-hover:translate-x-[200%] 
                    transition-transform duration-1000 ease-in-out" />
      
      <h3 className="text-gray-400/90 text-xs mb-1 relative z-10">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center relative z-10">
        <span 
          className={`
            ${isArrhythmiaDisplay ? 'text-sm' : 'text-xl'} 
            font-bold 
            ${color || 'text-white/90'}
            transition-all duration-300
            animate-[pulse_3s_ease-in-out_infinite]
          `}
        >
          {isArrhythmiaDisplay ? text : value}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-xs animate-[pulse_3s_ease-in-out_infinite]">{unit}</span>
        )}
      </div>
      
      {/* Efecto de borde brillante */}
      <div className="absolute inset-0 rounded border border-white/10 
                    group-hover:border-white/20 transition-colors duration-300" />
    </div>
  );
};

export default VitalSign;

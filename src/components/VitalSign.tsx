
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
        color: "text-red-500"
      };
    }
    
    return {
      text: "SIN ARRITMIAS",
      color: "text-cyan-500"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="relative overflow-hidden group bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-md rounded-lg p-4">
      {/* Efecto de destello */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 
                    transform -translate-x-full group-hover:translate-x-full 
                    transition-transform duration-1000 ease-in-out" />
      
      {/* Borde brillante */}
      <div className="absolute inset-0 rounded-lg border border-white/10 
                    group-hover:border-white/20 transition-colors duration-300" />
      
      {/* Contenido */}
      <div className="relative z-10">
        <h3 className="text-gray-400/90 text-xs mb-2 tracking-wider">{label}</h3>
        <div className="flex items-baseline gap-1 justify-center">
          <span 
            className={`
              ${isArrhythmiaDisplay ? 'text-sm' : 'text-2xl'} 
              font-bold 
              ${color || 'text-white'}
              transition-all duration-300
              animate-[pulse_3s_ease-in-out_infinite]
              relative
            `}
          >
            {/* Efecto de brillo en el texto */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                         opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-300" />
            <span className="relative">{isArrhythmiaDisplay ? text : value}</span>
          </span>
          {!isArrhythmiaDisplay && unit && (
            <span className="text-gray-400/90 text-xs">{unit}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VitalSign;

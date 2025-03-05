
import React from 'react';

interface PermissionsMessageProps {
  permissionsGranted: boolean;
}

const PermissionsMessage: React.FC<PermissionsMessageProps> = ({ permissionsGranted }) => {
  if (permissionsGranted) return null;
  
  return (
    <div className="absolute z-50 top-1/2 left-0 right-0 text-center px-4 transform -translate-y-1/2">
      <div className="bg-red-900/80 backdrop-blur-sm p-4 rounded-lg mx-auto max-w-md">
        <h3 className="text-xl font-bold text-white mb-2">Permisos necesarios</h3>
        <p className="text-white/90 mb-4">
          Esta aplicación necesita acceso a la cámara para medir tus signos vitales.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-white text-red-900 font-bold py-2 px-4 rounded"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
};

export default PermissionsMessage;

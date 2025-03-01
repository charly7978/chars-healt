import React, { useState, useEffect } from 'react';
import { ArrhythmiaDiagnostics, getLastDiagnostics } from '../utils/diagnosticLogger';

interface DiagnosticOverlayProps {
  isVisible: boolean;
}

const DiagnosticOverlay: React.FC<DiagnosticOverlayProps> = ({ isVisible }) => {
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [amplitudesReceived, setAmplitudesReceived] = useState(0);
  const [lastDetections, setLastDetections] = useState<any[]>([]);
  const [detectionRates, setDetectionRates] = useState({ total: 0, withAmplitude: 0, success: 0 });
  const [showPerformance, setShowPerformance] = useState(false);

  // Actualizar datos cada segundo
  useEffect(() => {
    if (!isVisible) return;
    
    const interval = setInterval(() => {
      const summary = ArrhythmiaDiagnostics.getDiagnosticSummary();
      
      // Calcular cuántos logs de procesamiento tienen amplitud proporcionada
      const processingLogs = getLastDiagnostics('ArrhythmiaDetection', 'SignalProcessing', 50);
      const withAmplitude = processingLogs.filter(log => log.data.amplitudeProvided).length;
      setAmplitudesReceived(withAmplitude);
      
      // Obtener las últimas 3 detecciones para mostrar detalles
      const detections = ArrhythmiaDiagnostics.getLastDetections(3);
      setLastDetections(detections);
      
      // Calcular tasas de detección
      const totalProcessed = processingLogs.length;
      const withAmplitudeCount = withAmplitude;
      const successfulDetections = summary.detectionCount;
      
      setDetectionRates({
        total: totalProcessed,
        withAmplitude: withAmplitudeCount,
        success: successfulDetections
      });
      
      setDiagnosticData(summary);
      setUpdateCount(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isVisible]);

  // Función para formatear segundos como tiempo legible
  const formatRunningTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  if (!isVisible || !diagnosticData) return null;

  // Obtener datos de rendimiento
  const performance = diagnosticData.performance || {};

  return (
    <div 
      style={{
        position: 'absolute',
        bottom: 60,
        left: 0,
        right: 0,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: 10,
        fontFamily: 'monospace',
        fontSize: 10,
        zIndex: 9999,
        maxHeight: '30vh',
        overflow: 'auto'
      }}
    >
      <h3 style={{ margin: '0 0 5px', color: '#00ff00' }}>Diagnóstico de Arritmias</h3>
      
      <div style={{ marginBottom: 5 }}>
        <span style={{ color: '#00ff00' }}>Detecciones:</span> {diagnosticData.detectionCount}
        <span style={{ marginLeft: 10, color: '#00ff00' }}>Procesamientos:</span> {diagnosticData.processingCount}
        <span style={{ marginLeft: 10, color: '#00ff00' }}>Resets:</span> {diagnosticData.resetCount}
      </div>
      
      <div style={{ marginBottom: 5 }}>
        <span style={{ color: '#00ff00' }}>Amplitudes recibidas:</span> {' '}
        {amplitudesReceived}/{diagnosticData.processingCount} ({amplitudesReceived > 0 
          ? Math.round((amplitudesReceived/diagnosticData.processingCount) * 100) 
          : 0}%)
        <span style={{ marginLeft: 10, color: '#00ff00' }}>Detección con amplitud:</span> {' '}
        {detectionRates.success > 0 && detectionRates.withAmplitude > 0 
          ? Math.round((detectionRates.success/detectionRates.withAmplitude) * 100) 
          : 0}%
      </div>
      
      {diagnosticData.lastDetection && (
        <div style={{ marginBottom: 5 }}>
          <span style={{ color: '#00ff00' }}>Última detección:</span> {new Date(diagnosticData.lastDetection.timestamp).toLocaleTimeString()}
          <span style={{ marginLeft: 10, color: '#00ff00' }}>Conteo:</span> {diagnosticData.lastDetection.data.count}
        </div>
      )}
      
      {/* Mostrar estadísticas de rendimiento cuando se solicita */}
      <div style={{ marginTop: 5, marginBottom: 5 }}>
        <button 
          onClick={() => setShowPerformance(!showPerformance)} 
          style={{
            background: 'none',
            border: '1px solid #00ff00',
            color: '#00ff00',
            padding: '2px 5px',
            fontSize: 9,
            cursor: 'pointer'
          }}
        >
          {showPerformance ? 'Ocultar estadísticas' : 'Ver estadísticas'}
        </button>
      </div>
      
      {showPerformance && performance && (
        <div style={{ 
          marginTop: 5, 
          marginBottom: 5, 
          borderTop: '1px solid #333', 
          paddingTop: 5, 
          fontSize: 9 
        }}>
          <div style={{ marginBottom: 3 }}>
            <span style={{ color: '#00ff00' }}>Tiempo de ejecución:</span>{' '}
            {formatRunningTime(performance.runningTimeSec || 0)}
            <span style={{ marginLeft: 10, color: '#00ff00' }}>Último reset:</span>{' '}
            {formatRunningTime((performance.timeSinceLastResetMs || 0) / 1000)}
          </div>
          
          <div style={{ marginBottom: 3 }}>
            <span style={{ color: '#00ff00' }}>Tasa detección:</span>{' '}
            {(performance.detectionRate || 0).toFixed(2)}/s
            <span style={{ marginLeft: 10, color: '#00ff00' }}>Falsos positivos est.:</span>{' '}
            {Math.round((performance.estimatedFalsePositiveRate || 0) * 100)}%
          </div>
          
          <div style={{ marginBottom: 3 }}>
            <span style={{ color: '#00ff00' }}>Señales procesadas:</span>{' '}
            {performance.processedSignals || 0}
            <span style={{ marginLeft: 10, color: '#00ff00' }}>Con amplitud:</span>{' '}
            {Math.round((performance.amplitudeRate || 0) * 100)}%
          </div>
        </div>
      )}
      
      {/* Mostrar las últimas detecciones con detalles */}
      {lastDetections.length > 0 && (
        <div style={{ marginTop: 5, borderTop: '1px solid #333', paddingTop: 5 }}>
          <span style={{ color: '#00ff00' }}>Últimas detecciones:</span>
          {lastDetections.map((detection, index) => (
            <div key={index} style={{ fontSize: 9, marginTop: 3, paddingLeft: 5 }}>
              {new Date(detection.timestamp).toLocaleTimeString()} - 
              {detection.data.type === 'AmplitudeBasedDetection' 
                ? ` Amplitud: ${Math.round(detection.data.ampRatio * 100)}% normal` 
                : ` RR: ${detection.data.shortRR || 0}/${detection.data.longRR || 0}ms`}
            </div>
          ))}
        </div>
      )}
      
      {diagnosticData.processingCount > 0 && (
        <div style={{ marginBottom: 5 }}>
          <span style={{ color: '#00ff00' }}>Estado de procesamiento:</span> {' '}
          <span style={{ 
            color: diagnosticData.processingCount > 10 ? '#00ff00' : '#ff0000' 
          }}>
            {diagnosticData.processingCount > 10 ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      )}
      
      {diagnosticData.lastError && (
        <div style={{ color: '#ff0000', marginTop: 5 }}>
          <span>Último error:</span> {diagnosticData.lastError.data.message || JSON.stringify(diagnosticData.lastError.data)}
        </div>
      )}
      
      <div style={{ fontSize: 8, color: '#777', marginTop: 5, borderTop: '1px solid #333', paddingTop: 3 }}>
        <span>Motor: ArrhythmiaAnalyzer-v2.1.3</span> | Actualizado: {updateCount} veces
      </div>
    </div>
  );
};

export default DiagnosticOverlay; 
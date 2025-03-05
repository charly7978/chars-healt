
import { useState, useCallback } from 'react';
import { useMonitoring } from './useMonitoring';

/**
 * Custom hook to manage vital signs monitoring state and interactions
 * This isolates the monitoring logic from the presentation layer
 */
export const useVitalSignsMonitoring = () => {
  // Re-export the useMonitoring hook functionality
  const {
    isMonitoring,
    isCameraOn,
    signalQuality,
    vitalSigns,
    heartRate,
    elapsedTime,
    lastArrhythmiaData,
    measurementComplete,
    finalValues,
    permissionsGranted,
    handlePermissionsGranted,
    handlePermissionsDenied,
    startMonitoring,
    handleReset,
    handleStreamReady,
    lastSignal
  } = useMonitoring();

  return {
    // Monitoring state
    isMonitoring,
    isCameraOn,
    signalQuality,
    vitalSigns,
    heartRate,
    elapsedTime,
    lastArrhythmiaData,
    measurementComplete,
    finalValues,
    
    // Permissions
    permissionsGranted,
    handlePermissionsGranted,
    handlePermissionsDenied,
    
    // Actions
    startMonitoring,
    handleReset,
    handleStreamReady,
    
    // Signal data
    lastSignal
  };
};

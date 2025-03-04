
/**
 * Constants for SpO2 calculation and processing
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05, // Reducido para calibración más precisa
  MIN_AC_VALUE: 0.05, // MODIFICACIÓN: Reducido de 0.1 a 0.05 para aumentar aún más la sensibilidad
  R_RATIO_A: 110, // Calibrado para máximo realista
  R_RATIO_B: 25, // Rango más natural
  BASELINE: 97, // Línea base normal saludable
  MOVING_AVERAGE_ALPHA: 0.15,
  BUFFER_SIZE: 25 // MODIFICACIÓN: Aumentado de 20 a 25 para mejorar la estabilidad a largo plazo
};

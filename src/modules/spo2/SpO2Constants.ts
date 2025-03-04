
/**
 * Constants for SpO2 calculation and processing
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05, // Reducido para calibración más precisa
  MIN_AC_VALUE: 0.1, // MODIFICACIÓN #1: Reducido de 0.2 a 0.1 para aumentar sensibilidad
  R_RATIO_A: 110, // Calibrado para máximo realista
  R_RATIO_B: 25, // Rango más natural
  BASELINE: 97, // Línea base normal saludable
  MOVING_AVERAGE_ALPHA: 0.15,
  BUFFER_SIZE: 20 // MODIFICACIÓN #2: Aumentado de 15 a 20 para mejorar estabilidad
};

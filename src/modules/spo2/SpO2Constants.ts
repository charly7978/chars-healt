
/**
 * Constants for SpO2 calculation and processing
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05, // Reducido para calibración más precisa
  MIN_AC_VALUE: 0.001, // MODIFICACIÓN: Reducido extremadamente de 0.03 a 0.001 para detectar cualquier señal
  R_RATIO_A: 110, // Calibrado para máximo realista
  R_RATIO_B: 25, // Rango más natural
  BASELINE: 97, // Línea base normal saludable
  MOVING_AVERAGE_ALPHA: 0.15,
  BUFFER_SIZE: 40 // MODIFICACIÓN: Aumentado a 40 para mayor estabilidad
};

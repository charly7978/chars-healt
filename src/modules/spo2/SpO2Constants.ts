
/**
 * Constants for SpO2 calculation and processing
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05, // Reducido para calibración más precisa
  MIN_AC_VALUE: 0.03, // MODIFICACIÓN: Reducido drásticamente de 0.05 a 0.03 para detectar señales extremadamente débiles
  R_RATIO_A: 110, // Calibrado para máximo realista
  R_RATIO_B: 25, // Rango más natural
  BASELINE: 97, // Línea base normal saludable
  MOVING_AVERAGE_ALPHA: 0.15,
  BUFFER_SIZE: 30 // MODIFICACIÓN: Aumentado de 25 a 30 para mayor estabilidad
};


// Extended definition for MediaTrackConstraints and MediaTrackCapabilities
interface MediaTrackConstraints {
  width?: number | ConstrainULongRange;
  height?: number | ConstrainULongRange;
  frameRate?: number | ConstrainDoubleRange;
  facingMode?: string | string[] | ConstrainDOMStringParameters;
  aspectRatio?: number | ConstrainDoubleRange;
  exposureCompensation?: ConstrainDoubleRange;
  colorTemperature?: ConstrainULongRange;
  brightness?: ConstrainDoubleRange;
  contrast?: ConstrainDoubleRange;
  saturation?: ConstrainDoubleRange;
  whiteBalanceMode?: string | string[];
  focusMode?: string | string[];
  focusDistance?: ConstrainDoubleRange;
  zoom?: ConstrainDoubleRange;
  // Add other camera constraints as needed
}

interface MediaTrackCapabilities {
  width?: ULongRange;
  height?: ULongRange;
  frameRate?: DoubleRange;
  facingMode?: string[];
  aspectRatio?: DoubleRange;
  exposureCompensation?: DoubleRange;
  colorTemperature?: ULongRange;
  brightness?: DoubleRange;
  contrast?: DoubleRange;
  saturation?: DoubleRange;
  whiteBalanceMode?: string[];
  focusMode?: string[];
  focusDistance?: DoubleRange;
  zoom?: DoubleRange;
  // Add other camera capabilities as needed
}

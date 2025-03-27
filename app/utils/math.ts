export function remap(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number
) {
  return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
}

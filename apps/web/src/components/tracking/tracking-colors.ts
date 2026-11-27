// Stable per native device ID: independent of list order, selection and refresh.
const COLORS = ['#0f766e', '#7c3aed', '#2563eb', '#c2410c', '#be185d', '#4d7c0f', '#0e7490', '#a16207'];
export function assetColor(deviceId: number) {
  return COLORS[Math.abs(Math.trunc(deviceId)) % COLORS.length];
}

export function signaturePoint(
  clientX: number,
  clientY: number,
  rect: {
    left: number;
    top: number;
    right: number;
    width: number;
    height: number;
  },
  width: number,
  height: number,
  rotated: boolean,
) {
  return rotated
    ? {
        x: ((clientY - rect.top) * width) / rect.height,
        y: ((rect.right - clientX) * height) / rect.width,
      }
    : {
        x: ((clientX - rect.left) * width) / rect.width,
        y: ((clientY - rect.top) * height) / rect.height,
      };
}

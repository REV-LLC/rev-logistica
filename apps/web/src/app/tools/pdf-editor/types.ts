export type PdfTextFragment = {
  index: number;
  text: string;
  editable: boolean;
  reason?: string;
  font?: string;
  size?: number;
  charSpacing?: number;
  wordSpacing?: number;
  horizontalScale?: number;
  kerningAdjustments?: number;
  quad?: number[][];
};
export type PdfInspection = { pageCount: number; texts: PdfTextFragment[] };

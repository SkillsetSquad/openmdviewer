import type { ReaderAsset, ReaderDocument } from "./types";
export interface ConversionInput {
  file: File;
  path: string;
}
export interface ConversionReport {
  sourcePath: string;
  path: string;
  documentId: string;
  format: "HTML" | "DOCX";
  images: number;
  warnings: string[];
  warningCount: number;
}
export interface ConversionResult {
  documents: ReaderDocument[];
  assets: ReaderAsset[];
  reports: ConversionReport[];
}
export const convertibleFile = (path: string) => /\.(html?|docx)$/i.test(path);

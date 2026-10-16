import type { ReaderAsset, ReaderDocument } from "./types";
export interface ConversionInput {
  file: File;
  password?: string;
  pdfMode?: "text" | "attachment";
  path: string;
}
export interface ConversionReport {
  sourcePath: string;
  path: string;
  documentId: string;
  format: "HTML" | "DOCX" | "PDF";
  pdf?: PdfConversionDetails;
  images: number;
  warnings: string[];
  warningCount: number;
}
export interface ConversionResult {
  documents: ReaderDocument[];
  assets: ReaderAsset[];
  reports: ConversionReport[];
  collections?: import("./collections").CollectionDraft[];
}
export const convertibleFile = (path: string) =>
  /\.(html?|docx|pdf)$/i.test(path);
export const shouldConvertInput = (input: ConversionInput) =>
  convertibleFile(input.path) &&
  !(/\.pdf$/i.test(input.path) && input.pdfMode === "attachment");

export interface PdfConversionDetails {
  pages: number;
  textPages: number;
  emptyPages: number[];
  pageAnchors: Record<number, string>;
}
export class ConversionPasswordError extends Error {
  constructor(
    public sourcePath: string,
    public incorrect: boolean,
  ) {
    super(
      incorrect
        ? "The PDF password was not accepted. Try again."
        : "This PDF needs a password to extract its text.",
    );
    this.name = "ConversionPasswordError";
  }
}

export interface ReaderDocument {
  id: string;
  path: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  favorite: boolean;
  scroll: number;
}
export type ReadingMode = "read" | "split" | "source";
export type ReaderTheme =
  "dark" | "light" | "sepia" | "oled" | "contrast" | "system";
export interface Preferences {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  readingWidth: number;
  fontFamily: "sans" | "serif" | "mono";
}
export interface Heading {
  id: string;
  text: string;
  depth: number;
}
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

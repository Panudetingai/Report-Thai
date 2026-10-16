/** โครงสร้าง template / องค์ประกอบที่ designer ใช้ร่วมกัน */

export type BandType =
  | "pageHeader"
  | "title"
  | "columnHeader"
  | "detail"
  | "groupHeader"
  | "groupFooter"
  | "summary"
  | "pageFooter";

export type ElementKind =
  | "text"
  | "line"
  | "rectangle"
  | "ellipse"
  | "image"
  | "table"
  | "checkbox"
  | "frame";

export type ReportData = Record<string, unknown>;

export interface Band {
  type: BandType;
  height: number;
  name?: string;
  groupBy?: string;
  elements: ReportElement[];
  [key: string]: unknown;
}

export interface PageSettings {
  size?: string;
  width?: number;
  height?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  [key: string]: unknown;
}

export interface ReportTemplate {
  page?: PageSettings;
  bands: Band[];
  [key: string]: unknown;
}

export interface BaseElement {
  type: ElementKind | string;
  x: number;
  y: number;
  w: number;
  h: number;
  group?: string;
  group_name?: string;
  frame?: string;
  name?: string;
  [key: string]: unknown;
}

export type ReportElement = BaseElement;

export interface BindContext {
  row?: Record<string, unknown>;
  page?: number;
  pages?: number;
}

export type ResolveResult =
  | { ok: true; value: string }
  | { ok: false; reason: "missing" | "unsupported" };

export type BindSegment = { text: string } | { raw: string; reason: string };

export interface HistoryState {
  template: ReportTemplate;
  data: ReportData;
  past: { template: ReportTemplate; data: ReportData }[];
  future: { template: ReportTemplate; data: ReportData }[];
  lastKey: string | null;
}

export type HistoryAction = { type: string; [key: string]: unknown };

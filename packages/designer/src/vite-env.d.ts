/// <reference types="vite/client" />

declare module "@thaireport/client" {
  export function initThaireport(): Promise<void>;
  export function previewTemplate(
    template: unknown,
    data: unknown,
  ): Promise<{ ok: boolean; pdf_base64?: string; bytes?: number; page_count?: number; error?: string }>;
}

declare module "*.css";

declare namespace React {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

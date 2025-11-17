import { Area } from "react-easy-crop";

export type OutputFormat = "jpeg" | "png" | "webp" | "pdf";

export interface EditingImage {
  id: string;
  name: string;
  originalFile: File;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  dataUrl: string;
  width: number;
  height: number;
  keepAspectRatio: boolean;
  quality: number;
  format: OutputFormat;
  crop: {
    crop: { x: number; y: number };
    zoom: number;
    aspect: number | null;
    rotation: number;
    croppedAreaPixels: Area | null;
  };
  processedSize?: number;
  processedUrl?: string;
}

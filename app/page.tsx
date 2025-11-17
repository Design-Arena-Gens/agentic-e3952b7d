"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import Cropper, { Area } from "react-easy-crop";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { v4 as uuid } from "uuid";
import clsx from "clsx";
import Image from "next/image";
import { EditingImage, OutputFormat } from "@/types/image";
import {
  canvasToBlob,
  getCroppedCanvas,
  loadImage,
  readFileAsDataURL,
  resizeCanvas
} from "@/lib/imageProcessing";

const OUTPUT_FORMATS: { label: string; value: OutputFormat; mime: string }[] = [
  { label: "JPEG (.jpg)", value: "jpeg", mime: "image/jpeg" },
  { label: "PNG (.png)", value: "png", mime: "image/png" },
  { label: "WebP (.webp)", value: "webp", mime: "image/webp" },
  { label: "PDF (.pdf)", value: "pdf", mime: "application/pdf" }
];

const humanFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(size > 99 || i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const formatFileName = (name: string, format: OutputFormat) => {
  const base = name.replace(/\.[^/.]+$/, "");
  const extension = format === "jpeg" ? "jpg" : format;
  return `${base}.${extension}`;
};

const ASPECT_OPTIONS = [
  { label: "Freeform", value: null },
  { label: "1:1 Square", value: 1 },
  { label: "4:5 Portrait", value: 4 / 5 },
  { label: "3:2 Landscape", value: 3 / 2 },
  { label: "16:9 Wide", value: 16 / 9 }
];

export default function Page() {
  const [images, setImages] = useState<EditingImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const selectedImage = useMemo(
    () => images.find((item) => item.id === selectedId) ?? images[0] ?? null,
    [images, selectedId]
  );

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;

    const newImages: EditingImage[] = [];

    for (const file of acceptedFiles) {
      if (!/^image\/(jpeg|jpg|png|webp|gif|bmp|tiff|svg\+xml|heic|heif)$/.test(file.type)) {
        // Skip unsupported files silently
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        const img = await loadImage(dataUrl);
        newImages.push({
          id: uuid(),
          name: file.name,
          originalFile: file,
          originalSize: file.size,
          originalWidth: img.naturalWidth || img.width,
          originalHeight: img.naturalHeight || img.height,
          dataUrl,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          keepAspectRatio: true,
          format: "jpeg",
          quality: 80,
          crop: {
            crop: { x: 0, y: 0 },
            zoom: 1,
            aspect: null,
            rotation: 0,
            croppedAreaPixels: null
          }
        });
      } catch (error) {
        // ignore faulty file
      }
    }

    if (!newImages.length) return;

    setImages((prev) => [...prev, ...newImages]);
    setSelectedId((prev) => prev ?? newImages[0].id);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "image/jpeg": [".jpeg", ".jpg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
      "image/heic": [".heic"],
      "image/heif": [".heif"]
    },
    noClick: true,
    noKeyboard: true
  });

  const updateImage = useCallback(
    (id: string, updater: (current: EditingImage) => EditingImage) => {
      setImages((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
    },
    []
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((item) => item.id !== id));
    setSelectedId((prev) => {
      if (prev === id) {
        const remaining = images.filter((item) => item.id !== id);
        return remaining[0]?.id ?? null;
      }
      return prev;
    });
  }, [images]);

  const handleDimensionChange = useCallback(
    (id: string, dimension: "width" | "height", value: number) => {
      updateImage(id, (current) => {
        const clamped = Math.max(1, Math.round(value));
        if (dimension === "width") {
          if (current.keepAspectRatio) {
            const ratio = current.originalHeight / current.originalWidth;
            return { ...current, width: clamped, height: Math.round(clamped * ratio) };
          }
          return { ...current, width: clamped };
        }
        if (current.keepAspectRatio) {
          const ratio = current.originalWidth / current.originalHeight;
          return { ...current, height: clamped, width: Math.round(clamped * ratio) };
        }
        return { ...current, height: clamped };
      });
    },
    [updateImage]
  );

  const handleToggleAspect = useCallback(
    (id: string, keep: boolean) => {
      updateImage(id, (current) => ({
        ...current,
        keepAspectRatio: keep
      }));
    },
    [updateImage]
  );

  const handleResetDimensions = useCallback(
    (id: string) => {
      updateImage(id, (current) => ({
        ...current,
        width: current.originalWidth,
        height: current.originalHeight
      }));
    },
    [updateImage]
  );

  const handleQualityChange = useCallback(
    (id: string, value: number) => {
      updateImage(id, (current) => ({ ...current, quality: value }));
    },
    [updateImage]
  );

  const handleFormatChange = useCallback(
    (id: string, format: OutputFormat) => {
      updateImage(id, (current) => ({ ...current, format }));
    },
    [updateImage]
  );

  const handleCropChange = useCallback(
    (id: string, value: { crop?: { x: number; y: number }; zoom?: number; rotation?: number }) => {
      updateImage(id, (current) => ({
        ...current,
        crop: {
          ...current.crop,
          crop: value.crop ?? current.crop.crop,
          zoom: value.zoom ?? current.crop.zoom,
          rotation: value.rotation ?? current.crop.rotation,
          croppedAreaPixels: current.crop.croppedAreaPixels
        }
      }));
    },
    [updateImage]
  );

  const handleCropComplete = useCallback(
    (id: string, _croppedArea: Area, croppedAreaPixels: Area) => {
      updateImage(id, (current) => ({
        ...current,
        crop: {
          ...current.crop,
          croppedAreaPixels
        }
      }));
    },
    [updateImage]
  );

  const handleAspectPreset = useCallback(
    (id: string, aspect: number | null) => {
      updateImage(id, (current) => ({
        ...current,
        crop: {
          ...current.crop,
          aspect
        }
      }));
    },
    [updateImage]
  );

  const handleApplyCrop = useCallback(
    async (id: string) => {
      const target = images.find((item) => item.id === id);
      if (!target || !target.crop.croppedAreaPixels) return;

      try {
        const canvas = await getCroppedCanvas(target.dataUrl, target.crop.croppedAreaPixels, target.crop.rotation);
        const newDataUrl = canvas.toDataURL("image/png");
        updateImage(id, (current) => ({
          ...current,
          dataUrl: newDataUrl,
          width: canvas.width,
          height: canvas.height,
          crop: {
            crop: { x: 0, y: 0 },
            zoom: 1,
            aspect: current.crop.aspect,
            rotation: 0,
            croppedAreaPixels: null
          }
        }));
      } catch (error) {
        console.error(error);
      }
    },
    [images, updateImage]
  );

  const handleResetImage = useCallback(
    async (id: string) => {
      const target = images.find((item) => item.id === id);
      if (!target) return;

      try {
        const dataUrl = await readFileAsDataURL(target.originalFile);
        const img = await loadImage(dataUrl);
        updateImage(id, () => ({
          ...target,
          dataUrl,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          crop: {
            crop: { x: 0, y: 0 },
            zoom: 1,
            aspect: null,
            rotation: 0,
            croppedAreaPixels: null
          },
          processedUrl: undefined,
          processedSize: undefined,
          format: "jpeg",
          quality: 80
        }));
      } catch (error) {
        console.error(error);
      }
    },
    [images, updateImage]
  );

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadProcessed = useCallback(
    (id: string) => {
      const image = images.find((item) => item.id === id);
      if (!image?.processedUrl) return;
      const anchor = document.createElement("a");
      anchor.href = image.processedUrl;
      anchor.download = formatFileName(image.name, image.format);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
    [images]
  );

  const processImages = useCallback(async () => {
    if (!images.length) return;
    setIsProcessing(true);
    setProcessingMessage("Preparing files…");

    const zip = new JSZip();
    const results: EditingImage[] = [];
    const filesForDownload: { fileName: string; blob: Blob }[] = [];

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      setProcessingMessage(`Processing ${image.name} (${index + 1}/${images.length})…`);

      try {
        if (image.processedUrl) {
          URL.revokeObjectURL(image.processedUrl);
        }

        const baseCanvas = await getCroppedCanvas(image.dataUrl, null, 0);
        const resizedCanvas = resizeCanvas(baseCanvas, image.width, image.height);

        if (image.format === "pdf") {
          const pdf = new jsPDF({
            orientation: resizedCanvas.width > resizedCanvas.height ? "l" : "p",
            unit: "px",
            format: [resizedCanvas.width, resizedCanvas.height],
            compress: true
          });

          const imgData = resizedCanvas.toDataURL("image/jpeg", Math.min(1, Math.max(0.1, image.quality / 100)));
          pdf.addImage(imgData, "JPEG", 0, 0, resizedCanvas.width, resizedCanvas.height, undefined, "FAST");
          const blob = pdf.output("blob") as Blob;
          const fileName = formatFileName(image.name, image.format);
          filesForDownload.push({ fileName, blob });
          results.push({
            ...image,
            processedSize: blob.size,
            processedUrl: URL.createObjectURL(blob)
          });
          continue;
        }

        const formatInfo = OUTPUT_FORMATS.find((item) => item.value === image.format);
        const mime = formatInfo?.mime ?? "image/jpeg";
        const blob = await canvasToBlob(
          resizedCanvas,
          mime,
          Math.min(1, Math.max(0.1, image.quality / 100))
        );
        const fileName = formatFileName(image.name, image.format);
        filesForDownload.push({ fileName, blob });
        results.push({
          ...image,
          processedSize: blob.size,
          processedUrl: URL.createObjectURL(blob)
        });
      } catch (error) {
        console.error("Image processing failed", error);
      }
    }

    setProcessingMessage("Bundling files…");

    if (filesForDownload.length === 1) {
      const { fileName, blob } = filesForDownload[0];
      triggerDownload(blob, fileName);
    } else {
      for (const file of filesForDownload) {
        zip.file(file.fileName, file.blob);
      }
      const bundle = await zip.generateAsync({ type: "blob" });
      triggerDownload(bundle, `compressed-${Date.now()}.zip`);
    }

    setImages(results);
    setProcessingMessage(null);
    setIsProcessing(false);
  }, [images]);

  return (
    <main>
      <div className="container">
        <div className="card">
          <div className="badge">JPEG Image Compressor · Photo Resizer</div>
          <h1 className="section-title">
            Compress, resize, crop, and convert photos in seconds{" "}
            <span className="hero-highlight">— entirely in your browser.</span>
          </h1>
          <p className="section-subtitle">
            Professional-grade output with instant offline processing. Drop in your photos, adjust resolution,
            quality, aspect ratio, and export them as JPEG, PNG, WebP, or PDF without sacrificing clarity.
          </p>

          <div
            {...getRootProps({
              className: clsx("dropzone", isDragActive && "dropzone--active")
            })}
          >
            <input {...getInputProps()} />
            <p style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Drag & drop images here or
            </p>
            <button className="button-primary" onClick={open} type="button">
              Browse files
            </button>
            <p style={{ opacity: 0.65, marginTop: "0.75rem" }}>
              Supports JPEG, PNG, WebP, GIF, BMP, TIFF, SVG, HEIC. Your files never leave the browser.
            </p>
          </div>

          {!!images.length && (
            <>
              <div className="divider" />
              <section className="grid grid--two">
                <div>
                  {selectedImage ? (
                    <ImageWorkspace
                      image={selectedImage}
                      onDimensionChange={handleDimensionChange}
                      onToggleAspect={handleToggleAspect}
                      onResetDimensions={handleResetDimensions}
                      onQualityChange={handleQualityChange}
                      onFormatChange={handleFormatChange}
                      onCropChange={handleCropChange}
                      onCropComplete={handleCropComplete}
                      onAspectPreset={handleAspectPreset}
                      onApplyCrop={handleApplyCrop}
                      onResetImage={handleResetImage}
                    />
                  ) : (
                    <EmptyWorkspace />
                  )}
                </div>
                <aside>
                  <PreviewGrid
                    images={images}
                    selectedId={selectedImage?.id ?? null}
                    onSelect={setSelectedId}
                    onRemove={removeImage}
                    onDownload={handleDownloadProcessed}
                  />
                </aside>
              </section>
              <div className="divider" />
              <section style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <span style={{ fontWeight: 600 }}>Ready to export</span>
                  <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
                    {images.length} {images.length === 1 ? "image" : "images"} selected
                  </span>
                </div>
                <button
                  className="button-primary"
                  type="button"
                  onClick={processImages}
                  disabled={isProcessing}
                  style={{ minWidth: "220px" }}
                >
                  {isProcessing ? "Processing…" : "Export & Download"}
                </button>
                <span className="chip">
                  <strong>Total original:</strong>{" "}
                  {humanFileSize(images.reduce((sum, item) => sum + item.originalSize, 0))}
                </span>
                {images.some((item) => item.processedSize) && (
                  <span className="chip">
                    <strong>Estimated output:</strong>{" "}
                    {humanFileSize(images.reduce((sum, item) => sum + (item.processedSize ?? 0), 0))}
                  </span>
                )}
              </section>
            </>
          )}
        </div>
        <footer className="footer">
          Lightning-fast photo compression with powerful offline controls. Optimized for photographers and content
          teams handling high-resolution workflows.
        </footer>
      </div>
      {processingMessage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(2,6,23,0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 50
          }}
        >
          <div className="card" style={{ maxWidth: 360, textAlign: "center" }}>
            <p style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: "0.6rem" }}>Working…</p>
            <p style={{ opacity: 0.75 }}>{processingMessage}</p>
          </div>
        </div>
      )}
    </main>
  );
}

function EmptyWorkspace() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        gap: "0.5rem",
        padding: "3rem",
        borderRadius: "24px",
        border: "1px dashed rgba(148,163,184,0.3)",
        color: "rgba(148,163,184,0.75)"
      }}
    >
      <span style={{ fontWeight: 600 }}>Select an image to start editing</span>
      <span style={{ fontSize: "0.9rem" }}>
        Uploaded images will appear in the panel on the right. Pick one to customize.
      </span>
    </div>
  );
}

interface ImageWorkspaceProps {
  image: EditingImage;
  onDimensionChange: (id: string, dimension: "width" | "height", value: number) => void;
  onToggleAspect: (id: string, keep: boolean) => void;
  onResetDimensions: (id: string) => void;
  onQualityChange: (id: string, value: number) => void;
  onFormatChange: (id: string, format: OutputFormat) => void;
  onCropChange: (
    id: string,
    value: { crop?: { x: number; y: number }; zoom?: number; rotation?: number }
  ) => void;
  onCropComplete: (id: string, area: Area, croppedAreaPixels: Area) => void;
  onAspectPreset: (id: string, aspect: number | null) => void;
  onApplyCrop: (id: string) => void;
  onResetImage: (id: string) => void;
}

function ImageWorkspace({
  image,
  onDimensionChange,
  onToggleAspect,
  onResetDimensions,
  onQualityChange,
  onFormatChange,
  onCropChange,
  onCropComplete,
  onAspectPreset,
  onApplyCrop,
  onResetImage
}: ImageWorkspaceProps) {
  return (
    <div className="panel">
      <div className="crop-container">
        <Cropper
          image={image.dataUrl}
          crop={image.crop.crop}
          zoom={image.crop.zoom}
          aspect={image.crop.aspect ?? undefined}
          rotation={image.crop.rotation}
          onCropChange={(crop) => onCropChange(image.id, { crop })}
          onZoomChange={(zoom) => onCropChange(image.id, { zoom })}
          onRotationChange={(rotation) => onCropChange(image.id, { rotation })}
          onCropComplete={(area, pixels) => onCropComplete(image.id, area, pixels)}
          cropShape="rect"
        />
      </div>

      <div className="panel-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {ASPECT_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={clsx("button-secondary", option.value === image.crop.aspect && "button-active")}
              style={{
                borderColor:
                  option.value === image.crop.aspect ? "rgba(59,130,246,0.65)" : "rgba(148,163,184,0.35)",
                color: option.value === image.crop.aspect ? "#bfdbfe" : undefined
              }}
              onClick={() => onAspectPreset(image.id, option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="button-secondary" type="button" onClick={() => onApplyCrop(image.id)}>
            Apply Crop
          </button>
          <button className="button-secondary" type="button" onClick={() => onResetImage(image.id)}>
            Reset Image
          </button>
        </div>
      </div>

      <div className="panel-row">
        <div style={{ flex: 1 }}>
          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span>Width (px)</span>
            <input
              className="input"
              type="number"
              min={1}
              value={image.width}
              onChange={(event) => onDimensionChange(image.id, "width", Number(event.target.value))}
            />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span>Height (px)</span>
            <input
              className="input"
              type="number"
              min={1}
              value={image.height}
              onChange={(event) => onDimensionChange(image.id, "height", Number(event.target.value))}
            />
          </label>
        </div>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <span>Aspect lock</span>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.9rem"
            }}
          >
            <input
              type="checkbox"
              checked={image.keepAspectRatio}
              onChange={(event) => onToggleAspect(image.id, event.target.checked)}
            />
            Keep original ratio
          </label>
        </div>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <span>Original</span>
          <button className="button-secondary" type="button" onClick={() => onResetDimensions(image.id)}>
            Reset size
          </button>
        </div>
      </div>

      <div>
        <div className="range-label">
          <span>Compression quality</span>
          <span>{image.quality}%</span>
        </div>
        <input
          className="slider"
          type="range"
          min={10}
          max={100}
          step={1}
          value={image.quality}
          onChange={(event) => onQualityChange(image.id, Number(event.target.value))}
        />
      </div>

      <div className="panel-row">
        <div style={{ flex: 1, display: "grid", gap: "0.4rem" }}>
          <span>Convert to format</span>
          <select
            className="input"
            value={image.format}
            onChange={(event) => onFormatChange(image.id, event.target.value as OutputFormat)}
          >
            {OUTPUT_FORMATS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            Quality slider applies to JPEG/PNG/WebP. PDFs embed a compressed JPEG.
          </span>
        </div>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <span>Rotation</span>
          <input
            className="input"
            type="number"
            value={image.crop.rotation}
            onChange={(event) => onCropChange(image.id, { rotation: Number(event.target.value) })}
          />
          <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Apply angle then crop to commit.</span>
        </div>
      </div>
    </div>
  );
}

interface PreviewGridProps {
  images: EditingImage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload: (id: string) => void;
}

function PreviewGrid({ images, selectedId, onSelect, onRemove, onDownload }: PreviewGridProps) {
  if (!images.length) return null;

  return (
    <div className="preview-grid">
      {images.map((image) => (
        <div
          key={image.id}
          className="preview-card"
          style={{
            borderColor: image.id === selectedId ? "rgba(59,130,246,0.6)" : "rgba(148,163,184,0.25)",
            boxShadow:
              image.id === selectedId
                ? "0 0 0 2px rgba(59,130,246,0.35)"
                : "0 10px 25px rgba(15,23,42,0.4)",
            cursor: "pointer"
          }}
          onClick={() => onSelect(image.id)}
        >
          <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3" }}>
            <Image
              src={image.dataUrl}
              alt={image.name}
              fill
              sizes="(max-width: 768px) 100vw, 280px"
              style={{ objectFit: "contain", borderRadius: "12px" }}
            />
          </div>
          <div style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              {image.name.length > 34 ? `${image.name.slice(0, 34)}…` : image.name}
            </span>
            <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
              {image.width} × {image.height}px · {humanFileSize(image.originalSize)}
            </span>
            {image.processedSize && (
              <span style={{ fontSize: "0.78rem", color: "#4ade80" }}>
                Output ~ {humanFileSize(image.processedSize)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <span className="tag tag--info">{image.format.toUpperCase()}</span>
            <span className="tag tag--success">{image.quality}%</span>
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {image.processedUrl && (
              <button
                className="button-primary"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDownload(image.id);
                }}
              >
                Download latest export
              </button>
            )}
            <button
              className="button-secondary"
              style={{ width: "100%" }}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(image.id);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

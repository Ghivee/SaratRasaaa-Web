'use client';

/**
 * ImageDropZone — reusable drag-and-drop file uploader (Task 11b).
 *
 * Renders a dashed-border drop zone that accepts image/PDF files via click OR
 * drag-and-drop. Reads the file as a base64 data URL via FileReader and passes
 * it up via `onChange`. Shows an inline image/PDF preview when `value` is set,
 * with "Ganti" (replace) and "Hapus" (remove) actions.
 *
 * Used by:
 *   - AdminPanel Kelola Event tab (fotoCover).
 *   - (Future) documentation photo uploads.
 *
 * The `value` prop accepts both:
 *   - a base64 data URL (from a new upload), e.g. "data:image/jpeg;base64,..."
 *   - a relative path string (from an existing record), e.g. "/uploads/cover-xxx.jpg"
 *     — resolved against window.location.origin for display.
 *
 * Validation:
 *   - MIME type / extension must match the `accept` list (default JPG/PNG/PDF).
 *   - File size must be ≤ `maxSizeBytes` (default 2 MB).
 *   - On either failure, a sonner toast is shown and the file is rejected.
 *
 * Accessibility:
 *   - The empty zone is a focusable button (role=button, tabIndex=0) that
 *     opens the hidden <input type="file"> on click OR Enter/Space.
 *   - The hidden input is `aria-hidden` (the visible UI is the labelled
 *     control) but still operable for screen-reader users via the wrapper.
 *
 * All animations/transitions respect `prefers-reduced-motion` via the
 * transition-colors / ring utilities (no transform animation here).
 */

import { useCallback, useRef, useState } from "react";
import { Upload, X, ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageDropZoneProps {
  /** Current value: base64 data URL, a path string, or null. */
  value: string | null;
  /** Called with the new data URL on valid upload, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  /** Comma-separated MIME / extension list. Default: JPG/PNG/PDF. */
  accept?: string;
  /** Max file size in bytes. Default: 2 MB. */
  maxSizeBytes?: number;
  /** Optional label rendered above the zone. */
  label?: string;
  /** Optional aspect class for the empty state, e.g. "aspect-video". */
  aspect?: string;
}

const DEFAULT_ACCEPT = "image/jpeg,image/png,application/pdf";
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Build a friendly short label like "JPG/PNG/PDF" from an accept string. */
function friendlyAcceptLabel(accept: string): string {
  return accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      if (t === "image/jpeg") return "JPG";
      if (t === "image/png") return "PNG";
      if (t === "image/gif") return "GIF";
      if (t === "image/webp") return "WEBP";
      if (t === "application/pdf") return "PDF";
      if (t.startsWith("image/")) return t.slice("image/".length).toUpperCase();
      if (t.startsWith(".")) return t.slice(1).toUpperCase();
      return t;
    })
    .join("/");
}

/** Is the given value an image (data URL or path/URL ending in image ext)? */
function isImageValue(v: string): boolean {
  if (v.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(v);
}

/** Is the given value a PDF (data URL or path/URL ending in .pdf)? */
function isPdfValue(v: string): boolean {
  if (v.startsWith("data:application/pdf")) return true;
  return /\.pdf$/i.test(v);
}

export function ImageDropZone({
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxSizeBytes = DEFAULT_MAX_BYTES,
  label,
  aspect,
}: ImageDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acceptedTokens = accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const maxMB = Math.max(1, Math.round(maxSizeBytes / (1024 * 1024)));
  const acceptLabel = friendlyAcceptLabel(accept);

  /** Resolve a stored value to a displayable URL. Path strings starting with
   *  "/" are prefixed with the current origin so existing /uploads/* images
   *  load correctly in the preview. */
  const resolveDisplayUrl = useCallback((v: string): string => {
    if (v.startsWith("data:") || v.startsWith("http://") || v.startsWith("https://")) {
      return v;
    }
    if (typeof window !== "undefined" && v.startsWith("/")) {
      return `${window.location.origin}${v}`;
    }
    return v;
  }, []);

  /** Check a File against the accept list. Accepts both MIME and extension
   *  tokens to handle browsers that report an empty `type`. */
  const isAcceptedType = useCallback(
    (file: File): boolean => {
      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      return acceptedTokens.some((token) => {
        if (token.startsWith(".")) return token.toLowerCase() === ext;
        if (token === "application/pdf") {
          return file.type === "application/pdf" || ext === ".pdf";
        }
        if (token.startsWith("image/")) {
          // Allow any image type when the accept list has a generic image/*
          // OR a specific image/jpeg that some browsers normalize differently.
          if (file.type.startsWith("image/")) return true;
          return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
        }
        return file.type === token;
      });
    },
    [acceptedTokens],
  );

  /** Validate + read the file as a base64 data URL, then call onChange. */
  const validateAndRead = useCallback(
    (file: File) => {
      if (!isAcceptedType(file)) {
        toast.error("Tipe file tidak diizinkan. Hanya JPG, PNG, atau PDF.");
        return;
      }
      if (file.size > maxSizeBytes) {
        toast.error(`Ukuran file terlalu besar. Maksimal ${maxMB}MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          onChange(result);
        } else {
          toast.error("Gagal membaca file.");
        }
      };
      reader.onerror = () => {
        toast.error("Gagal membaca file.");
      };
      reader.readAsDataURL(file);
    },
    [isAcceptedType, maxSizeBytes, maxMB, onChange],
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndRead(file);
    // Reset so the same file can be re-selected after an error/clear.
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndRead(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const emptyZoneClasses = cn(
    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors",
    "hover:border-primary/50 hover:bg-secondary/20",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    aspect,
    dragging && "border-primary bg-secondary/30 ring-2 ring-primary/30",
  );

  const previewZoneClasses = cn(
    "relative rounded-xl border-2 border-dashed border-border p-4 transition-colors",
    dragging && "border-primary bg-secondary/30 ring-2 ring-primary/30",
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {!value ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={emptyZoneClasses}
          aria-label={label ? `Unggah ${label}` : "Unggah file"}
        >
          <Upload
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Klik atau seret file ke sini
            </p>
            <p className="text-xs text-muted-foreground">
              {acceptLabel} maks {maxMB}MB
            </p>
          </div>
        </div>
      ) : (
        <div
          className={previewZoneClasses}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isImageValue(value) ? (
            <img
              src={resolveDisplayUrl(value)}
              alt="Pratinjau"
              className="mx-auto max-h-40 rounded-lg object-contain"
              loading="lazy"
              decoding="async"
            />
          ) : isPdfValue(value) ? (
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <FileText className="size-10 text-primary" aria-hidden />
              <p className="max-w-full truncate text-sm font-medium text-foreground">
                {value.startsWith("data:")
                  ? "File PDF"
                  : (value.split("/").pop() || "File PDF")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <ImageIcon
                className="size-10 text-muted-foreground"
                aria-hidden
              />
              <p className="max-w-full truncate text-sm font-medium text-foreground">
                {value.split("/").pop() || "File"}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              className="rounded-full bg-secondary px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
            >
              Ganti
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-4 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
              aria-label="Hapus file"
            >
              <X className="size-3.5" aria-hidden /> Hapus
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageDropZone;

'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './admin.module.css';

export interface ImageCropperModalProps {
  file?: File;
  imageUrl?: string;
  fileName?: string;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

const C_W = 270;
const C_H = 360; // 3:4 aspect ratio (270 / 360 = 0.75)

export function ImageCropperModal({
  file,
  imageUrl,
  fileName,
  onConfirm,
  onCancel,
}: ImageCropperModalProps) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imgSize, setImgSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;

    if (imageUrl) {
      setImageSrc(imageUrl);
      return () => {
        active = false;
      };
    }

    if (file) {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          const objUrl = URL.createObjectURL(file);
          if (active) setImageSrc(objUrl);
          return () => {
            active = false;
            if (typeof URL.revokeObjectURL === 'function') {
              URL.revokeObjectURL(objUrl);
            }
          };
        } catch {
          // fallback to FileReader
        }
      }

      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = () => {
          if (active && typeof reader.result === 'string') {
            setImageSrc(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    }

    return () => {
      active = false;
    };
  }, [file, imageUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const baseScale =
    imgSize.width && imgSize.height
      ? Math.max(C_W / imgSize.width, C_H / imgSize.height)
      : 1;

  const renderedW = imgSize.width * baseScale * zoom;
  const renderedH = imgSize.height * baseScale * zoom;
  const maxPanX = Math.max(0, (renderedW - C_W) / 2);
  const maxPanY = Math.max(0, (renderedH - C_H) / 2);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setStartPan(pan);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const nextX = Math.max(-maxPanX, Math.min(maxPanX, startPan.x + dx));
    const nextY = Math.max(-maxPanY, Math.min(maxPanY, startPan.y + dy));
    setPan({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextZoom = parseFloat(e.target.value);
    setZoom(nextZoom);
    if (!imgSize.width || !imgSize.height) return;
    const nextW = imgSize.width * baseScale * nextZoom;
    const nextH = imgSize.height * baseScale * nextZoom;
    const nextMaxX = Math.max(0, (nextW - C_W) / 2);
    const nextMaxY = Math.max(0, (nextH - C_H) / 2);
    setPan((prev) => ({
      x: Math.max(-nextMaxX, Math.min(nextMaxX, prev.x)),
      y: Math.max(-nextMaxY, Math.min(nextMaxY, prev.y)),
    }));
  };

  // ponytail:native-canvas-cropper — dependency-free 3:4 canvas cropper with drag & zoom; upgrade to react-easy-crop or cropperjs if rotation is needed
  const handleApplyCrop = () => {
    const rawName =
      file?.name ||
      fileName ||
      (imageUrl ? imageUrl.split('/').pop()?.split('?')[0] : 'product.jpg') ||
      'product.jpg';
    const fallbackFile =
      file ??
      new File(
        [new Uint8Array([])],
        rawName.replace(/\.[^.]+$/, '').replace(/-cropped$/, '') +
          '-cropped.jpg',
        {
          type: 'image/jpeg',
        },
      );

    const img = imgRef.current;
    if (!img || !imgSize.width || !imgSize.height) {
      onConfirm(fallbackFile);
      return;
    }

    const targetW = 600;
    const targetH = 800; // 3:4 aspect ratio
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    if (!ctx || typeof canvas.toBlob !== 'function') {
      onConfirm(fallbackFile);
      return;
    }

    const currentW = imgSize.width * baseScale * zoom;
    const currentH = imgSize.height * baseScale * zoom;
    const imgScreenLeft = C_W / 2 + pan.x - currentW / 2;
    const imgScreenTop = C_H / 2 + pan.y - currentH / 2;

    const sx = -imgScreenLeft / (baseScale * zoom);
    const sy = -imgScreenTop / (baseScale * zoom);
    const sw = C_W / (baseScale * zoom);
    const sh = C_H / (baseScale * zoom);

    try {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            onConfirm(fallbackFile);
            return;
          }
          const croppedFileName =
            rawName.replace(/\.[^.]+$/, '').replace(/-cropped$/, '') +
            '-cropped.jpg';
          const croppedFile = new File([blob], croppedFileName, {
            type: 'image/jpeg',
          });
          onConfirm(croppedFile);
        },
        'image/jpeg',
        0.92,
      );
    } catch {
      onConfirm(fallbackFile);
    }
  };

  return (
    <div className={styles.cropModalOverlay}>
      <div
        className={styles.cropModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-modal-title"
      >
        <h3 id="crop-modal-title" className={styles.cropModalTitle}>
          Sesuaikan Foto Produk (3:4)
        </h3>
        <p className={styles.cropModalSubtitle}>
          Geser foto dan atur zoom agar pakaian berada di tengah frame.
        </p>

        <div
          className={styles.cropViewport}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          {imageSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop target"
              crossOrigin="anonymous"
              draggable={false}
              onLoad={(e) => {
                setImgSize({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                });
              }}
              style={{
                position: 'absolute',
                width: renderedW > 0 ? `${renderedW}px` : '100%',
                height: renderedH > 0 ? `${renderedH}px` : '100%',
                left: `${C_W / 2 - renderedW / 2 + pan.x}px`,
                top: `${C_H / 2 - renderedH / 2 + pan.y}px`,
                pointerEvents: 'none',
                maxWidth: 'none',
              }}
            />
          ) : null}
          <div className={styles.cropGridOverlay} />
        </div>

        <div className={styles.cropControls}>
          <div className={styles.cropZoomRow}>
            <span>Zoom:</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={handleZoomChange}
              className={styles.cropZoomSlider}
              aria-label="Perbesaran (Zoom)"
            />
            <span>{zoom.toFixed(1)}x</span>
          </div>
        </div>

        <div className={styles.cropActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            Batal
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleApplyCrop}
          >
            Potong &amp; Gunakan Foto
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useState, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Set up the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 0.85;

const HANDLE_HIT_RADIUS = 10;
const HANDLE_SIZE = 7;
const MIN_SELECTION_SIZE = 4;

// Resize modes are compass-direction strings ("n", "se", ...); "move" drags the
// whole selection; "new" draws a fresh one. Each char in a resize mode names the
// edge it moves, which resizeRect() exploits via simple substring checks.
type DragMode = "new" | "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
const CORNER_MODES: DragMode[] = ["nw", "ne", "sw", "se"];
const EDGE_MODES: DragMode[] = ["n", "s", "e", "w"];

const CURSOR_FOR_MODE: Record<string, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  move: "move",
};

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  origSelection: PixelRect | null;
  offsetX: number;
  offsetY: number;
}

function rectFromPoints(x0: number, y0: number, x1: number, y1: number): PixelRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function resizeRect(
  orig: PixelRect,
  mode: DragMode,
  curX: number,
  curY: number,
  canvasW: number,
  canvasH: number
): PixelRect {
  let left = orig.x;
  let top = orig.y;
  let right = orig.x + orig.width;
  let bottom = orig.y + orig.height;

  if (mode.includes("n")) top = Math.min(curY, bottom - MIN_SELECTION_SIZE);
  if (mode.includes("s")) bottom = Math.max(curY, top + MIN_SELECTION_SIZE);
  if (mode.includes("w")) left = Math.min(curX, right - MIN_SELECTION_SIZE);
  if (mode.includes("e")) right = Math.max(curX, left + MIN_SELECTION_SIZE);

  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(canvasW, right);
  bottom = Math.min(canvasH, bottom);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function resizeAnchor(orig: PixelRect, mode: DragMode): [number, number] {
  const left = orig.x;
  const right = orig.x + orig.width;
  const top = orig.y;
  const bottom = orig.y + orig.height;
  switch (mode) {
    case "nw":
      return [right, bottom];
    case "ne":
      return [left, bottom];
    case "sw":
      return [right, top];
    case "se":
      return [left, top];
    default:
      return [left, top];
  }
}

// Grow/shrink from a fixed corner (anchorX, anchorY) towards the cursor, clamped to the canvas.
function aspectFromAnchor(
  curX: number,
  curY: number,
  anchorX: number,
  anchorY: number,
  ratio: number,
  canvasW: number,
  canvasH: number
): PixelRect {
  const rawW = Math.abs(curX - anchorX);
  const rawH = Math.abs(curY - anchorY);
  const desiredW = Math.max(rawW, rawH * ratio);

  const dirX = curX >= anchorX ? 1 : -1;
  const dirY = curY >= anchorY ? 1 : -1;
  const availableX = dirX > 0 ? canvasW - anchorX : anchorX;
  const availableY = dirY > 0 ? canvasH - anchorY : anchorY;
  const maxW = availableY <= 0 ? availableX : Math.min(availableX, availableY * ratio);

  const width = Math.max(0, Math.min(desiredW, maxW));
  const height = width / ratio;
  const newX = anchorX + dirX * width;
  const newY = anchorY + dirY * height;
  return rectFromPoints(anchorX, anchorY, newX, newY);
}

// Resize from a single edge, keeping the opposite edge fixed and growing the
// perpendicular dimension symmetrically around the rect's current center, clamped
// to the canvas.
function aspectFromEdge(
  curX: number,
  curY: number,
  mode: DragMode,
  orig: PixelRect,
  ratio: number,
  canvasW: number,
  canvasH: number
): PixelRect {
  const left = orig.x;
  const right = orig.x + orig.width;
  const top = orig.y;
  const bottom = orig.y + orig.height;
  const centerX = orig.x + orig.width / 2;
  const centerY = orig.y + orig.height / 2;

  if (mode === "e" || mode === "w") {
    const anchorX = mode === "e" ? left : right;
    const dirX = mode === "e" ? 1 : -1;
    const rawW = Math.abs(curX - anchorX);
    const availableX = mode === "e" ? canvasW - anchorX : anchorX;
    const availableWFromY = 2 * Math.min(centerY, canvasH - centerY) * ratio;
    const width = Math.max(0, Math.min(rawW, availableX, availableWFromY));
    const height = width / ratio;
    const edgeX = anchorX + dirX * width;
    const [x0, x1] = mode === "e" ? [anchorX, edgeX] : [edgeX, anchorX];
    return rectFromPoints(x0, centerY - height / 2, x1, centerY + height / 2);
  }

  const anchorY = mode === "s" ? top : bottom;
  const dirY = mode === "s" ? 1 : -1;
  const rawH = Math.abs(curY - anchorY);
  const availableY = mode === "s" ? canvasH - anchorY : anchorY;
  const availableHFromX = (2 * Math.min(centerX, canvasW - centerX)) / ratio;
  const height = Math.max(0, Math.min(rawH, availableY, availableHFromX));
  const width = height * ratio;
  const edgeY = anchorY + dirY * height;
  const [y0, y1] = mode === "s" ? [anchorY, edgeY] : [edgeY, anchorY];
  return rectFromPoints(centerX - width / 2, y0, centerX + width / 2, y1);
}

// Dispatch to the right aspect-locked resize shape for `mode`.
function applyAspect(
  curX: number,
  curY: number,
  drag: DragState,
  ratio: number,
  canvasW: number,
  canvasH: number
): PixelRect {
  if (drag.mode === "new") {
    return aspectFromAnchor(curX, curY, drag.startX, drag.startY, ratio, canvasW, canvasH);
  }
  if (CORNER_MODES.includes(drag.mode)) {
    const [ax, ay] = resizeAnchor(drag.origSelection!, drag.mode);
    return aspectFromAnchor(curX, curY, ax, ay, ratio, canvasW, canvasH);
  }
  return aspectFromEdge(curX, curY, drag.mode, drag.origSelection!, ratio, canvasW, canvasH);
}

// Reshape a selection to width/height == ratio, keeping its center fixed and clamped
// to the canvas.
function conformSelectionToAspect(
  sel: PixelRect,
  ratio: number,
  canvasW: number,
  canvasH: number
): PixelRect {
  const centerX = sel.x + sel.width / 2;
  const centerY = sel.y + sel.height / 2;
  const desiredW = Math.max(sel.width, sel.height * ratio);
  const maxWX = 2 * Math.min(centerX, canvasW - centerX);
  const maxWY = 2 * Math.min(centerY, canvasH - centerY) * ratio;
  const width = Math.max(0, Math.min(desiredW, maxWX, maxWY));
  const height = width / ratio;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

function hitTest(x: number, y: number, sel: PixelRect | null): DragMode | null {
  if (!sel) return null;
  const left = sel.x;
  const right = sel.x + sel.width;
  const top = sel.y;
  const bottom = sel.y + sel.height;
  const r = HANDLE_HIT_RADIUS;

  const nearLeft = x >= left - r && x <= left + r;
  const nearRight = x >= right - r && x <= right + r;
  const nearTop = y >= top - r && y <= top + r;
  const nearBottom = y >= bottom - r && y <= bottom + r;
  const inXRange = x >= left - r && x <= right + r;
  const inYRange = y >= top - r && y <= bottom + r;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop && inXRange) return "n";
  if (nearBottom && inXRange) return "s";
  if (nearLeft && inYRange) return "w";
  if (nearRight && inYRange) return "e";
  if (x > left && x < right && y > top && y < bottom) return "move";
  return null;
}

interface PdfCropSelectorProps {
  pdfUrl: string;
  pageIndex?: number; // 0-based
  aspectRatio?: number | null; // width / height, or null for free-form
  onCropAreaSelect: (cropArea: CropArea) => void;
  onPageCountChange?: (pageCount: number) => void;
}

const PdfCropSelector: React.FC<PdfCropSelectorProps> = ({
  pdfUrl,
  pageIndex = 0,
  aspectRatio = null,
  onCropAreaSelect,
  onPageCountChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pageRef = useRef<pdfjsLib.PDFPageProxy | null>(null);
  const currentPdfUrlRef = useRef<string | null>(null);
  const basePageHeightRef = useRef(0); // page height in PDF points (scale-1 viewport)

  const baseImageDataRef = useRef<ImageData | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const renderScaleRef = useRef(1);
  const isRenderingRef = useRef(false);
  const pendingScaleRef = useRef<number | null>(null);

  const selectionRef = useRef<PixelRect | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const base = baseImageDataRef.current;
    if (!canvas || !ctx || !base) return;

    ctx.putImageData(base, 0, 0);

    const sel = selectionRef.current;
    if (!sel) return;
    const { x, y, width, height } = sel;

    ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    const half = HANDLE_SIZE / 2;
    const handlePoints: [number, number][] = [
      [x, y], [x + width / 2, y], [x + width, y],
      [x, y + height / 2], [x + width, y + height / 2],
      [x, y + height], [x + width / 2, y + height], [x + width, y + height],
    ];
    ctx.lineWidth = 1.5;
    for (const [hx, hy] of handlePoints) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeStyle = "#ef4444";
      ctx.strokeRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
    }
  };

  const renderAtScale = async (scale: number) => {
    if (isRenderingRef.current) {
      pendingScaleRef.current = scale;
      return;
    }
    isRenderingRef.current = true;
    try {
      const page = pageRef.current;
      const canvas = canvasRef.current;
      if (!page || !canvas) return;

      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvasSizeRef.current = { width: viewport.width, height: viewport.height };

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.resetTransform();
      await page.render({ canvasContext: ctx, viewport }).promise;

      baseImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      renderScaleRef.current = scale;
      redraw();
    } catch (error) {
      console.error("Failed to render PDF page", error);
    } finally {
      isRenderingRef.current = false;
      if (pendingScaleRef.current !== null) {
        const next = pendingScaleRef.current;
        pendingScaleRef.current = null;
        if (next !== scale) await renderAtScale(next);
      }
    }
  };

  const loadPage = async (index: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    const page = await pdf.getPage(index + 1);
    pageRef.current = page;
    basePageHeightRef.current = page.getViewport({ scale: 1 }).height;
    selectionRef.current = null;
    await renderAtScale(zoom);
  };

  // Load the document (once per URL) and the requested page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        if (currentPdfUrlRef.current !== pdfUrl) {
          const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
          if (cancelled) return;
          pdfDocRef.current = pdf;
          currentPdfUrlRef.current = pdfUrl;
          onPageCountChange?.(pdf.numPages);
        }
        await loadPage(pageIndex);
      } catch (error) {
        console.error("Failed to load PDF", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, pageIndex]);

  // Zoom changes: re-render the page and rescale any existing selection to match.
  useEffect(() => {
    if (isLoading) return;
    if (renderScaleRef.current === zoom) return;
    const ratio = zoom / renderScaleRef.current;
    const sel = selectionRef.current;
    if (sel) {
      selectionRef.current = {
        x: sel.x * ratio,
        y: sel.y * ratio,
        width: sel.width * ratio,
        height: sel.height * ratio,
      };
    }
    renderAtScale(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, isLoading]);

  const emitCropArea = () => {
    const sel = selectionRef.current;
    if (!sel || sel.width < 2 || sel.height < 2) return;

    const scale = renderScaleRef.current;
    const width = sel.width / scale;
    const height = sel.height / scale;
    const x = sel.x / scale;
    // Flip from the canvas's top-left origin to the PDF's bottom-left origin.
    const y = basePageHeightRef.current - sel.y / scale - height;

    onCropAreaSelect({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  };

  // Aspect ratio changes: live-reshape any existing selection to match.
  useEffect(() => {
    if (!aspectRatio || !selectionRef.current) return;
    const { width: canvasW, height: canvasH } = canvasSizeRef.current;
    selectionRef.current = conformSelectionToAspect(selectionRef.current, aspectRatio, canvasW, canvasH);
    redraw();
    emitCropArea();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const setCursorStyle = (mode: DragMode | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = (mode && CURSOR_FOR_MODE[mode]) || "crosshair";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isLoading) return;
    if (e.button === 1) {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      panRef.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
      return;
    }
    const { x, y } = getCanvasCoords(e);
    const sel = selectionRef.current;
    const hit = hitTest(x, y, sel);

    if (hit === "move" && sel) {
      dragRef.current = {
        mode: "move",
        startX: x,
        startY: y,
        origSelection: sel,
        offsetX: x - sel.x,
        offsetY: y - sel.y,
      };
    } else if (hit && sel && (CORNER_MODES.includes(hit) || EDGE_MODES.includes(hit))) {
      dragRef.current = { mode: hit, startX: x, startY: y, origSelection: sel, offsetX: 0, offsetY: 0 };
    } else {
      dragRef.current = { mode: "new", startX: x, startY: y, origSelection: null, offsetX: 0, offsetY: 0 };
      selectionRef.current = { x, y, width: 0, height: 0 };
      redraw();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (panRef.current) {
      const container = containerRef.current;
      if (!container) return;
      container.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.x);
      container.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.y);
      return;
    }
    const { x, y } = getCanvasCoords(e);
    const drag = dragRef.current;

    if (!drag) {
      setCursorStyle(hitTest(x, y, selectionRef.current));
      return;
    }

    const { width: canvasW, height: canvasH } = canvasSizeRef.current;
    const curX = Math.max(0, Math.min(canvasW, x));
    const curY = Math.max(0, Math.min(canvasH, y));

    let next: PixelRect;
    if (drag.mode === "move") {
      const { width, height } = drag.origSelection!;
      next = {
        x: Math.max(0, Math.min(canvasW - width, curX - drag.offsetX)),
        y: Math.max(0, Math.min(canvasH - height, curY - drag.offsetY)),
        width,
        height,
      };
    } else if (aspectRatio) {
      next = applyAspect(curX, curY, drag, aspectRatio, canvasW, canvasH);
    } else if (drag.mode === "new") {
      next = rectFromPoints(drag.startX, drag.startY, curX, curY);
    } else {
      next = resizeRect(drag.origSelection!, drag.mode, curX, curY, canvasW, canvasH);
    }

    selectionRef.current = next;
    redraw();
  };

  const finalizeDrag = () => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (!dragRef.current) return;
    dragRef.current = null;
    emitCropArea();
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Only zoom if Shift is held
    if (!e.shiftKey) return;
    e.preventDefault();
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))));
  };

  return (
    <div className="w-full border border-neutral-300 dark:border-neutral-600 rounded overflow-hidden bg-neutral-50 dark:bg-neutral-700/50 flex flex-col items-center">
      {isLoading && (
        <div className="w-full h-[400px] flex items-center justify-center">
          <p className="text-neutral-500 dark:text-neutral-400">Loading PDF...</p>
        </div>
      )}
      <div ref={containerRef} className="relative w-full h-[600px] overflow-auto">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={finalizeDrag}
          onMouseLeave={finalizeDrag}
          onWheel={handleWheel}
          className="mx-auto"
          style={{ display: isLoading ? "none" : "block", cursor: "crosshair" }}
        />
      </div>
      {!isLoading && (
        <div className="w-full px-4 py-2 bg-neutral-100 dark:bg-neutral-700 text-center text-xs text-neutral-600 dark:text-neutral-400">
          Zoom: {(zoom * 100).toFixed(0)}% (Shift + scroll to zoom) · Drag an edge or corner to
          resize the selection, or its interior to move it.
        </div>
      )}
    </div>
  );
};

export default PdfCropSelector;

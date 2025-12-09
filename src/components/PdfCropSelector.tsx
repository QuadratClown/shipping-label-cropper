import React, { useRef, useState, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Set up the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfCropSelectorProps {
    pdfUrl: string;
    onCropAreaSelect: (cropArea: { x: number, y: number, width: number, height: number }) => void;
}

const PdfCropSelector: React.FC<PdfCropSelectorProps> = ({ pdfUrl, onCropAreaSelect }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState<{ x: number, y: number } | null>(null);
    const [currentPos, setCurrentPos] = useState<{ x: number, y: number } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
    const pageRef = useRef<pdfjsLib.PDFPageProxy | null>(null);
    const originalImageDataRef = useRef<ImageData | null>(null);
    const baseCanvasWidthRef = useRef(0);
    const baseCanvasHeightRef = useRef(0);
    const baseScaleRef = useRef(1);
    const lastRenderZoomRef = useRef(1);
    const isRenderingRef = useRef(false);
    const pendingZoomRef = useRef<number | null>(null);

    useEffect(() => {
        const loadPdf = async () => {
            try {
                setIsLoading(true);
                const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
                pdfDocRef.current = pdf;
                const page = await pdf.getPage(1);
                pageRef.current = page;

                const canvas = canvasRef.current;
                const container = containerRef.current;
                if (!canvas || !container) return;

                const viewport = page.getViewport({ scale: 1 });

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                baseCanvasWidthRef.current = viewport.width;
                baseCanvasHeightRef.current = viewport.height;

                const ctx = canvas.getContext("2d");
                if (ctx) {
                    // Reset the context transformation
                    ctx.resetTransform();

                    await page.render({
                        canvasContext: ctx,
                        viewport: viewport,
                    }).promise;

                    // Store the original image data for redrawing
                    originalImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    isRenderingRef.current = false;
                }
                lastRenderZoomRef.current = 1;
                setZoom(0.85);
                setIsLoading(false);
            } catch (error) {
                console.error("Failed to load PDF", error);
                isRenderingRef.current = false;
                setIsLoading(false);
            }
        };

        // Small delay to ensure container has rendered
        const timer = setTimeout(loadPdf, 100);
        return () => clearTimeout(timer);
    }, [pdfUrl]);

    const redrawSelectionOnly = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !originalImageDataRef.current) return;

        // Restore original image
        ctx.putImageData(originalImageDataRef.current, 0, 0);

        // Draw selection rectangle if exists
        if (startPos && currentPos) {
            const minX = Math.min(startPos.x, currentPos.x);
            const minY = Math.min(startPos.y, currentPos.y);
            const width = Math.abs(currentPos.x - startPos.x);
            const height = Math.abs(currentPos.y - startPos.y);

            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2;
            ctx.strokeRect(minX, minY, width, height);

            ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
            ctx.fillRect(minX, minY, width, height);
        }
    };

    const renderPdfAtZoom = async (renderZoom: number) => {
        // If already rendering, queue this zoom level
        if (isRenderingRef.current) {
            pendingZoomRef.current = renderZoom;
            return;
        }

        isRenderingRef.current = true;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !pageRef.current) {
            isRenderingRef.current = false;
            return;
        }

        try {
            const zoomRatio = renderZoom / lastRenderZoomRef.current;

            // Calculate new dimensions
            const newWidth = baseCanvasWidthRef.current * renderZoom;
            const newHeight = baseCanvasHeightRef.current * renderZoom;

            canvas.width = newWidth;
            canvas.height = newHeight;

            // Render PDF at zoom resolution
            const renderScale = baseScaleRef.current * renderZoom;
            const viewport = pageRef.current.getViewport({ scale: renderScale });

            ctx.resetTransform();
            await pageRef.current.render({
                canvasContext: ctx,
                viewport: viewport,
            }).promise;

            // Store the rendered image data
            originalImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
            lastRenderZoomRef.current = renderZoom;

            // Scale selection positions if they exist
            if (startPos && currentPos) {
                setStartPos({
                    x: startPos.x * zoomRatio,
                    y: startPos.y * zoomRatio,
                });
                setCurrentPos({
                    x: currentPos.x * zoomRatio,
                    y: currentPos.y * zoomRatio,
                });
            }

            // If a new zoom was requested while rendering, process it
            if (pendingZoomRef.current !== null && pendingZoomRef.current !== renderZoom) {
                const nextZoom = pendingZoomRef.current;
                pendingZoomRef.current = null;
                isRenderingRef.current = false;
                await renderPdfAtZoom(nextZoom);
            } else {
                isRenderingRef.current = false;
            }
        } catch (error) {
            console.error("Failed to render PDF at zoom", error);
            isRenderingRef.current = false;
        }
    };

    const getRealCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        return { x, y };
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const { x, y } = getRealCanvasCoordinates(e);

        setIsDrawing(true);
        setStartPos({ x, y });
        setCurrentPos({ x, y });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !startPos) return;

        const { x, y } = getRealCanvasCoordinates(e);
        
        setCurrentPos({ x, y });
    };

    const handleMouseUp = () => {
        if (!isDrawing || !startPos || !currentPos) return;

        setIsDrawing(false);

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Convert canvas coordinates to PDF coordinates
        const width = Math.abs(currentPos.x - startPos.x);
        const height = Math.abs(currentPos.y - startPos.y);
        const minX = Math.min(startPos.x, currentPos.x);
        const minY = baseCanvasHeightRef.current - Math.min(startPos.y, currentPos.y) - height;

        onCropAreaSelect({
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(width),
            height: Math.round(height),
        });
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        // Only zoom if Shift is held
        if (!e.shiftKey) return;

        e.preventDefault();

        const zoomSpeed = 0.1;
        const newZoom = Math.max(0.5, Math.min(3, zoom + (e.deltaY > 0 ? -zoomSpeed : zoomSpeed)));
        setZoom(newZoom);
    };

    // Handle zoom changes - re-render PDF
    useEffect(() => {
        if (isLoading) return;

        const renderZoom = Math.max(1, zoom);
        if (lastRenderZoomRef.current !== renderZoom) {
            renderPdfAtZoom(renderZoom);
        }
    }, [zoom, isLoading]);

    // Handle selection changes - only redraw selection, not PDF
    useEffect(() => {
        if (isLoading || lastRenderZoomRef.current === 0) return;

        redrawSelectionOnly();
    }, [startPos, currentPos, isLoading]);

    return (
        <div ref={containerRef} className="w-full border border-neutral-300 dark:border-neutral-600 rounded overflow-hidden bg-neutral-50 dark:bg-neutral-700/50 flex flex-col items-center">
            {isLoading && (
                <div className="w-full h-[400px] flex items-center justify-center">
                    <p className="text-neutral-500 dark:text-neutral-400">Loading PDF...</p>
                </div>
            )}
            <div className="relative w-full h-[600px] overflow-auto flex justify-center align-items-center">
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    className="cursor-crosshair"
                    style={{
                        display: isLoading ? "none" : "block",
                        width: `${baseCanvasWidthRef.current * zoom}px`,
                        height: `${baseCanvasHeightRef.current * zoom}px`,
                    }}
                />
            </div>
            {!isLoading && (
                <div className="w-full px-4 py-2 bg-neutral-100 dark:bg-neutral-700 text-center text-xs text-neutral-600 dark:text-neutral-400">
                    Zoom: {(zoom * 100).toFixed(0)}% (Use Shift + mousewheel to zoom)
                </div>
            )}
        </div>
    );
};

export default PdfCropSelector;

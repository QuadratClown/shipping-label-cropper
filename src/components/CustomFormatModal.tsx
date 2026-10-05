import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload, X } from "lucide-react";
import PdfCropSelector from "./PdfCropSelector";

interface CustomFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFormatAdded: (formatName: string, cropArea: {x: number, y: number, width: number, height: number}) => void;
}

const ASPECT_SEPARATORS = [":", "x", "X", "/"];

function parseAspectRatio(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let rawWidth: string | null = null;
  let rawHeight: string | null = null;
  for (const sep of ASPECT_SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    if (idx !== -1) {
      rawWidth = trimmed.slice(0, idx);
      rawHeight = trimmed.slice(idx + 1);
      break;
    }
  }
  if (rawWidth === null || rawHeight === null) return null;

  const width = parseFloat(rawWidth.trim());
  const height = parseFloat(rawHeight.trim());
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

function swapAspectRatioText(text: string): string {
  const trimmed = text.trim();
  for (const sep of ASPECT_SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    if (idx !== -1) {
      const rawWidth = trimmed.slice(0, idx).trim();
      const rawHeight = trimmed.slice(idx + 1).trim();
      return `${rawHeight}:${rawWidth}`;
    }
  }
  return text;
}

const CustomFormatModal: React.FC<CustomFormatModalProps> = ({
  isOpen,
  onClose,
  onFormatAdded,
}) => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [formatName, setFormatName] = useState("");
  const [selectedCropArea, setSelectedCropArea] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [aspectRatioText, setAspectRatioText] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);

  const aspectRatio = parseAspectRatio(aspectRatioText);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles.find((f) => f.type === "application/pdf");
    if (file) {
      setPdfFile(file);
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setSelectedCropArea(null);
      setAspectRatioText("");
      setPageCount(1);
      setPageIndex(0);
    } else {
      alert("Please upload a PDF file.");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleConfirm = () => {
    if (!formatName.trim()) {
      alert("Please enter a format name");
      return;
    }
    if (!selectedCropArea) {
      alert("Please select a crop area");
      return;
    }
    onFormatAdded(formatName, selectedCropArea);
    resetModal();
  };

  const resetModal = () => {
    setPdfFile(null);
    setPdfUrl(null);
    setFormatName("");
    setSelectedCropArea(null);
    setAspectRatioText("");
    setPageCount(1);
    setPageIndex(0);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleChangePdf = () => {
    setPdfFile(null);
    setPdfUrl(null);
    setSelectedCropArea(null);
    setAspectRatioText("");
    setPageCount(1);
    setPageIndex(0);
  };

  const handleSwapAspectRatio = () => {
    setAspectRatioText((text) => swapAspectRatioText(text));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
            Create Custom Format
          </h2>
          <button
            onClick={handleClose}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!pdfUrl ? (
            <div
              {...getRootProps()}
              className={`flex flex-col items-center w-full border-2 border-dashed rounded-lg text-center cursor-pointer gap-4 p-8 transition-colors duration-200 ${
                isDragActive
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400"
                  : "border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700/50 text-neutral-500"
              }`}
            >
              <input {...getInputProps()} />
              <CloudUpload className="w-10 h-10" />
              <div>
                <p className="font-medium">Drag & Drop PDF here</p>
                <p className="text-sm">or</p>
              </div>
              <button className="rounded-lg bg-blue-500 font-semibold text-sm text-white hover:bg-blue-600 px-4 py-2">
                Select PDF
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block font-semibold text-sm text-neutral-700 dark:text-neutral-300 mb-2">
                  Format Name
                </label>
                <input
                  type="text"
                  value={formatName}
                  onChange={(e) => setFormatName(e.target.value)}
                  placeholder="e.g., Custom Label A"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block font-semibold text-sm text-neutral-700 dark:text-neutral-300 mb-2">
                    Aspect Ratio (W:H)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aspectRatioText}
                      onChange={(e) => setAspectRatioText(e.target.value)}
                      placeholder="optional, e.g. 100:150"
                      className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSwapAspectRatio}
                      title="Swap width and height"
                      className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                    >
                      ⇄
                    </button>
                  </div>
                </div>

                {pageCount > 1 && (
                  <div>
                    <label className="block font-semibold text-sm text-neutral-700 dark:text-neutral-300 mb-2">
                      Page
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={pageCount}
                      value={pageIndex + 1}
                      onChange={(e) => {
                        const value = Math.min(pageCount, Math.max(1, Number(e.target.value) || 1));
                        setPageIndex(value - 1);
                      }}
                      className="w-20 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-sm text-neutral-700 dark:text-neutral-300 mb-2">
                  Select Crop Area
                </label>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                  Click and drag on the page to select the crop area. Once drawn, drag an edge or
                  corner to resize it, or its interior to move it.
                </p>
                <PdfCropSelector
                  pdfUrl={pdfUrl}
                  pageIndex={pageIndex}
                  aspectRatio={aspectRatio}
                  onCropAreaSelect={setSelectedCropArea}
                  onPageCountChange={setPageCount}
                />
              </div>

              {selectedCropArea && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm text-blue-800 dark:text-blue-200">
                  Crop area selected: x={selectedCropArea.x}, y={selectedCropArea.y}, width={selectedCropArea.width}, height={selectedCropArea.height}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={handleChangePdf}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                >
                  Change PDF
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!formatName.trim() || !selectedCropArea}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-sm text-white px-4 py-2 transition-colors"
                >
                  Create Format
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomFormatModal;

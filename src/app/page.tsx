"use client";
import React, { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { PDFDocument } from "pdf-lib";
import { CloudUpload } from "lucide-react";
import Cookies from "js-cookie";
import Footer from "@/components/Footer";
import CustomFormatModal from "@/components/CustomFormatModal";

interface CustomFormat {
  id: string;
  name: string;
  cropArea: { x: number, y: number, width: number, height: number };
}

export default function Page() {
  const [labelFormat, setLabelFormat] = useState<'4x6' | '103x109' | string>('4x6');
  const [selectedFiles, setFiles] = useState<File[] | null>(null);
  const [croppedPdf, setCroppedPdf] = useState<Uint8Array | null>(null);
  const [croppedPdfUrl, setCroppedPdfUrl] = useState<string | null>(null);
  const [customFormats, setCustomFormats] = useState<CustomFormat[]>([]);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  useEffect(() => {
    const savedFormat = Cookies.get('labelFormat') as string | undefined;
    if (savedFormat) {
      setLabelFormat(savedFormat);
    }

    const savedCustomFormats = Cookies.get('customFormats');
    if (savedCustomFormats) {
      try {
        setCustomFormats(JSON.parse(savedCustomFormats));
      } catch (e) {
        console.error('Failed to parse custom formats', e);
      }
    }
  }, []);

  const getCropAreaForFormat = (format: string, formats: CustomFormat[] = customFormats): { x: number, y: number, width: number, height: number } | null => {
    switch (format) {
      case "4x6":
        return { x: 56, y: 53, width: 339, height: 508 };
      case "103x109":
        return { x: 0, y: 461, width: 666, height: 339 };
      default:
        return formats.find((f) => f.id === format)?.cropArea ?? null;
    }
  };

  const cropPdfWithFormat = async (files: File[], format: string, formats: CustomFormat[] = customFormats) => {
    const cropArea = getCropAreaForFormat(format, formats);
    if (!cropArea) {
      alert("Invalid format selected");
      return;
    }

    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      firstPage.setCropBox(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
      const pageCopies = await mergedPdf.copyPages(pdfDoc, [0])
      mergedPdf.addPage(pageCopies[0]);
    }
    const croppedPdfBytes = await mergedPdf.save();
    setCroppedPdf(croppedPdfBytes);
    const blob = new Blob([croppedPdfBytes as BlobPart], { type: "application/pdf" });
    setCroppedPdfUrl(URL.createObjectURL(blob));
  };

  const cropPdf = async (files: File[]) => {
    await cropPdfWithFormat(files, labelFormat);
  };

  const handleAddCustomFormat = (formatName: string, cropArea: { x: number, y: number, width: number, height: number }) => {
    const newFormat: CustomFormat = {
      id: `custom-${Date.now()}`,
      name: formatName,
      cropArea,
    };

    const updatedFormats = [...customFormats, newFormat];
    setCustomFormats(updatedFormats);
    Cookies.set('customFormats', JSON.stringify(updatedFormats), { expires: 365 });
    setLabelFormat(newFormat.id);
    Cookies.set('labelFormat', newFormat.id, { expires: 365 });
    setIsCustomModalOpen(false);
    
    // Trigger recrop with the new format if files are selected
    if (selectedFiles && selectedFiles.length > 0) {
      cropPdfWithFormat(selectedFiles, newFormat.id, updatedFormats);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    let files: File[] = [];
    for (const file of acceptedFiles) {
      if (file.type === "application/pdf") {
        files.push(file);
      } else {
        alert("Please upload a PDF file.");
      }
    }

    if (files.length > 0) {
      setFiles(files);
      await cropPdf(files);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const downloadCroppedPdf = () => {
    if (croppedPdf) {
      const blob = new Blob([croppedPdf as BlobPart], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${selectedFiles?.length == 1 ?
        selectedFiles[0]?.name.replace(".pdf", "") :
        `Shipping-labels-${new Date().toISOString().split("T")[0]}`
        }-cropped.pdf`;
      link.click();
    }
  };

  const printCroppedPdf = () => {
    if (!croppedPdf) return;

    const blob = new Blob([croppedPdf as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;

    document.body.appendChild(iframe);

    iframe.onload = () => {
      iframe.contentWindow?.print();
      URL.revokeObjectURL(url);
    };
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-screen bg-neutral-100 dark:bg-neutral-900 gap-2 p-8">
      <div className="w-full max-w-2xl flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center justify-center gap-2">
          <h1 className="text-4xl font-bold text-neutral-800 dark:text-neutral-200">
            Shipping Label Cropper
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Crop shipping transport labels into a PDF for printing
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <label className="font-semibold text-sm text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
            Label Format
          </label>

          <div className="flex gap-2">
            <select
              value={labelFormat === "__add_custom__" ? "4x6" : labelFormat}
              onChange={async (e) => {
                const newFormat = e.target.value;
                if (newFormat === "__add_custom__") {
                  setIsCustomModalOpen(true);
                } else {
                  setLabelFormat(newFormat);
                  Cookies.set('labelFormat', newFormat, { expires: 365 });
                  if (selectedFiles && selectedFiles.length > 0) {
                    await cropPdfWithFormat(selectedFiles, newFormat);
                  }
                }
              }}
              className="flex-1 rounded-lg border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-900 dark:text-neutral-100 shadow-sm transition-all duration-200 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 focus:border-blue-500"
            >
              <option value="4x6">DHL A4 (4" × 6")</option>
              <option value="103x109">DHL A4 (103mm × 109mm)</option>
              {customFormats.map((format) => (
                <option key={format.id} value={format.id}>{format.name}</option>
              ))}
              <option value="__add_custom__">+ Add Custom Format</option>
            </select>
            {labelFormat.startsWith('custom-') && (
              <button
                onClick={async () => {
                  const updated = customFormats.filter((f) => f.id !== labelFormat);
                  setCustomFormats(updated);
                  Cookies.set('customFormats', JSON.stringify(updated), { expires: 365 });
                  setLabelFormat('4x6');
                  Cookies.set('labelFormat', '4x6', { expires: 365 });
                  if (selectedFiles && selectedFiles.length > 0) {
                    await cropPdfWithFormat(selectedFiles, '4x6', updated);
                  }
                }}
                className="rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold text-sm px-3 py-3 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <CustomFormatModal
          isOpen={isCustomModalOpen}
          onClose={() => {
            setIsCustomModalOpen(false);
          }}
          onFormatAdded={handleAddCustomFormat}
        />

        {!croppedPdf && (
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg text-center text-sm cursor-pointer backdrop-blur-sm gap-4 mt-12 p-6 transition-colors duration-200 ${isDragActive
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400"
              : "border-neutral-400 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-500"
              }`}
          >
            <input {...getInputProps({ accept: "application/pdf" })} />
            <CloudUpload className="text-5xl text-neutral-500 w-10 h-10" />
            <p>Drag & Drop PDF files here</p>
            <span>or</span>
            <button className="rounded-lg bg-blue-500 font-semibold text-sm text-white dark:bg-blue-600 dark:text-neutral-200 hover:bg-blue-600 dark:hover:bg-blue-700 shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 px-4 py-2">
              Upload PDF(s)
            </button>
          </div>
        )}
        {selectedFiles && selectedFiles.length > 0 && (
          <div className="text-center text-neutral-700 dark:text-neutral-300 mt-4 w-full">
            <p>Selected Files:</p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  className="relative group"
                >
                  <button
                    onClick={() => {
                      const newFiles = selectedFiles.filter((_, index) => index !== i);
                      setFiles(newFiles);
                      if (newFiles.length === 0) {
                        setCroppedPdf(null);
                        setCroppedPdfUrl(null);
                      } else {
                        cropPdf(newFiles);
                      }
                    }}
                    className="rounded-lg bg-neutral-200 dark:bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-800 dark:text-neutral-200 shadow-sm transition-all duration-200 hover:bg-neutral-300 dark:hover:bg-neutral-600 w-full"
                  >
                    {f.name}
                  </button>
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      ×
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {croppedPdfUrl && (
          <div className="mt-6 w-full flex flex-col items-center gap-4">
            <p className="text-center text-neutral-700 dark:text-neutral-300 font-semibold">
              Preview:
            </p>
            <iframe
              src={croppedPdfUrl}
              className="w-full h-[400px] border border-neutral-300 dark:border-neutral-600 rounded"
              title="Cropped PDF Preview"
            ></iframe>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => {
                  setFiles(null);
                  setCroppedPdf(null);
                  setCroppedPdfUrl(null);
                }}
                className="flex-1 rounded-lg bg-neutral-500 hover:bg-neutral-600 text-white font-semibold text-sm px-4 py-3 transition-colors shadow-md"
              >
                Reset
              </button>
              <a
                href={croppedPdfUrl}
                download
                className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm px-4 py-3 transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                Download
              </a>
              <button
                onClick={printCroppedPdf}
                className="flex-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm px-4 py-3 transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                Print
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

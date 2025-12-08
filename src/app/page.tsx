"use client";
import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import { PDFDocument } from "pdf-lib";
import { CloudUpload } from "lucide-react";
import Footer from "@/components/Footer";

export default function Page() {
  const [labelFormat, setLabelFormat] = useState<'4x6' | '103x109'>('4x6');
  const [selectedFiles, setFiles] = useState<File[] | null>(null);
  const [croppedPdf, setCroppedPdf] = useState<Uint8Array | null>(null);
  const [croppedPdfUrl, setCroppedPdfUrl] = useState<string | null>(null);

  const cropPdf = async (files: File[]) => {
    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      firstPage.scale(0.85, 0.85);
      switch (labelFormat) {
        case "4x6":
          firstPage.setCropBox(48, 45, 288, 432);
          break;
        case "103x109":
          firstPage.setCropBox(0, 392, 566, 288);
          break;
      }
      const pageCopies = await mergedPdf.copyPages(pdfDoc, [0])
      mergedPdf.addPage(pageCopies[0]);
    }
    const croppedPdfBytes = await mergedPdf.save();
    setCroppedPdf(croppedPdfBytes);
    const blob = new Blob([croppedPdfBytes as BlobPart], { type: "application/pdf" });
    setCroppedPdfUrl(URL.createObjectURL(blob));
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
        `DHL-labels-${new Date().toISOString().split("T")[0]}`
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
            DHL Label Cropper
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Crop DHL transport labels into a PDF for printing
          </p>
        </div>
        <div className="w-full flex flex-col gap-2">
          <label className="font-medium text-sm text-neutral-700 dark:text-neutral-300">
            Label Format
          </label>

          <select
            value={labelFormat}
            onChange={(e) => setLabelFormat(e.target.value as '4x6' | '103x109')}
            className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="4x6">4" × 6"</option>
            <option value="103x109">103mm × 109mm</option>
          </select>
        </div>
        {!croppedPdf && (
          <div
            {...getRootProps()}
            className={`flex flex-col items-center w-full border-2 border-dashed rounded-lg text-center text-sm cursor-pointer backdrop-blur-sm gap-4 mt-12 p-6 transition-colors duration-200 ${
              isDragActive 
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
        {selectedFiles && (
          <div className="text-center text-neutral-700 dark:text-neutral-300 mt-4 w-full">
            <p>Selected Files:</p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {selectedFiles.map((f, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const newFiles = selectedFiles.filter((_, index) => index !== i);
                    setFiles(newFiles);
                    if (newFiles.length > 0) {
                      cropPdf(newFiles);
                    } else {
                      setCroppedPdf(null);
                      setCroppedPdfUrl(null);
                    }
                  }}
                  className="rounded-lg bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 text-sm font-medium px-3 py-1 shadow-sm flex items-center gap-1 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors duration-200"
                >
                  {f.name}
                  <span className="text-xs hover:bg-blue-300 dark:hover:bg-blue-700 rounded-full w-4 h-4 flex items-center justify-center transition-colors duration-200">×</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {croppedPdfUrl && (
          <div className="mt-4 w-full">
            <p className="text-center text-neutral-700 dark:text-neutral-300 mb-2">
              Preview:
            </p>
            <iframe
              src={croppedPdfUrl}
              className="w-full h-[29.5rem] border border-neutral-400 dark:border-neutral-600 rounded"
              title="PDF Preview"
            ></iframe>
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => {
                  setFiles(null);
                  setCroppedPdf(null);
                  setCroppedPdfUrl(null);
                }}
                className="rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-sm text-white shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={downloadCroppedPdf}
                className="rounded-lg bg-green-700 hover:bg-green-800 font-semibold text-sm text-white shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 px-4 py-2"
              >
                Download
              </button>
              <button
                onClick={printCroppedPdf}
                className="rounded-lg bg-blue-700 hover:bg-blue-800 font-semibold text-sm text-white shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 px-4 py-2"
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

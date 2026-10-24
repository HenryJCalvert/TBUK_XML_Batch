import React, { useState } from 'react';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadCsv: (csvContent: string, fileName: string) => void;
}

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadCsv,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      setErrorMsg('Please upload a valid .csv file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        onUploadCsv(text, file.name);
        onClose();
      }
    };
    reader.onerror = () => {
      setErrorMsg('Error reading file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import Payment Transactions CSV
              </h2>
              <p className="text-xs text-slate-500">
                Upload your payment transactions batch file
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              id="csv-file-input"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <label htmlFor="csv-file-input" className="cursor-pointer block">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-sm font-semibold text-slate-800">
                Drop your transaction .csv file here
              </div>
              <div className="text-xs text-slate-500 mt-1">
                or click to browse from your computer
              </div>
              <div className="text-[11px] text-slate-400 mt-3 font-mono">
                Columns: SORT CODE, ACCOUNT NUMBER, AMOUNT, PAYEE NAME, REFERENCE (TryBooking BANKCODE / ACCOUNTNO / TITLE / LODGEMENTREF also accepted)
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

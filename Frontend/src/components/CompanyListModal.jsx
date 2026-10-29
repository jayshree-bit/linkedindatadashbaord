
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  uploadCompanyListApi,
  downloadCompanyListSampleApi,
} from '../services/dataService';

export default function CompanyListModal({ open, onClose, onApplied }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const TEMPLATE_URL = '/templates/filterfile.xlsx';
  if (!open) return null;

  const reset = () => {
    setFile(null);
    setError('');
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const pick = (selectedFile) => {
    setError('');

    if (!selectedFile) return;

    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setFile(null);
      setError('Please choose an .xlsx file.');
      return;
    }

    setFile(selectedFile);
  };

  const downloadSample = async () => {
    try {
      setError('');
      const blob = await downloadCompanyListSampleApi();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = 'company-list-sample.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Could not download the sample file.');
    }
  };

  const apply = async () => {
    if (!file || busy) return;

    setBusy(true);
    setError('');

    try {
      const res = await uploadCompanyListApi(file);
      onApplied({ ...res, fileName: file.name });
      reset();
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Could not read the file.'
      );
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-list-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3
            id="company-list-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Filter by company list
          </h3>

          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-2xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            Upload an Excel file containing a{' '}
            <strong className="text-gray-900 dark:text-white">
              Company Domain
            </strong>{' '}
            column or a{' '}
            <strong className="text-gray-900 dark:text-white">
              Company Name
            </strong>{' '}
            column. Either column is sufficient to filter prospects.
          </p>

          {/* Sample table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    Company Domain
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    Company Name
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                <tr className="text-gray-600 dark:text-gray-300">
                  <td className="px-4 py-3">acme.com</td>
                  <td className="px-4 py-3">Acme Inc</td>
                </tr>
                <tr className="text-gray-600 dark:text-gray-300">
                  <td className="px-4 py-3">globex.com</td>
                  <td className="px-4 py-3">Globex Corporation</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Download sample */}
          <a
                href={TEMPLATE_URL}
                download="company_filter_template.xlsx"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
                ⬇ Download template
            </a>

          {/* File picker */}
          <div
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label="Choose an Excel file"
            onClick={() => {
              if (!busy) inputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (
                !busy &&
                (e.key === 'Enter' || e.key === ' ')
              ) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${
              file
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
            } ${busy ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mb-2 h-8 w-8 text-indigo-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.7}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16.5V19a2 2 0 002 2h12a2 2 0 002-2v-2.5M16 8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>

            <span className="break-all text-sm font-medium text-gray-800 dark:text-gray-100">
              {file ? file.name : 'Click to choose a file'}
            </span>

            <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {file
                ? 'Excel file selected'
                : 'or drag and drop your .xlsx file here'}
            </span>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              hidden
              disabled={busy}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end dark:border-gray-700 dark:bg-gray-800/50">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!file || busy}
            onClick={apply}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Applying...' : 'Upload & filter'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

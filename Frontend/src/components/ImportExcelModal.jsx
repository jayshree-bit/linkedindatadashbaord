import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { importProspects, resetImport } from '../features/dataSlice';

const MAX_SIZE = 25 * 1024 * 1024;

export default function ImportExcelModal({ onClose, onImported }) {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
   const {
    loading: uploading,
    phase,
    progress,
    stage,
    percent,
    processed,
    total,
    result,
    error: importError,
  } = useSelector((state) => state.data.importState);
  const shownPercent = phase === 'uploading' ? progress : percent;
  const employeeName =
    user?.name || user?.fullName || user?.employeeName || user?.username || '';

  const [status, setStatus] = useState(''); // '' | 'Qualified' | 'DisQualified'
  const [file, setFile] = useState(null);
  const [localError, setLocalError] = useState('');
  const inputRef = useRef(null);
const TEMPLATE_URL = '/templates/Prospect_Import_Template.xlsx';
  // Start and finish with a clean import state so an old result never shows up.
  useEffect(() => {
    dispatch(resetImport());
    return () => {
      dispatch(resetImport());
    };
  }, [dispatch]);

  const error = localError || importError;

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    setLocalError('');
    dispatch(resetImport());

    if (!f) return setFile(null);
    if (!/\.xlsx$/i.test(f.name)) {
      setFile(null);
      return setLocalError('Only .xlsx files are supported.');
    }
    if (f.size > MAX_SIZE) {
      setFile(null);
      return setLocalError('File is larger than 25 MB.');
    }
    setFile(f);
  };

  const upload = async () => {
  if (!status) return setLocalError('Select Qualified or DisQualified first.');
  if (!file) return setLocalError('Choose an .xlsx file.');

  const uploadedBy = user?._id || user?.id;
  if (!uploadedBy) return setLocalError('Could not identify the logged-in user. Please log in again.');

  setLocalError('');

  try {
    const data = await dispatch(importProspects({ status, file, uploadedBy })).unwrap();
    onImported?.(data);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  } catch {
    // error is already in state.data.importState.error
  }
};
  const duplicates = result?.duplicates ?? [];

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={uploading ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import prospects from Excel"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Import Prospects from Excel
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
            className="rounded-md px-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {/* Body */}
     
        <div className="grid gap-4 overflow-y-auto px-5 py-4">

               <div className="flex items-center justify-between rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 px-3 py-2">
            <span className="text-xs text-slate-600">
                Not sure about the format? Use our sample sheet.
            </span>
            <a
                href={TEMPLATE_URL}
                download="Prospect_Import_Template.xlsx"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
                ⬇ Download template
            </a>
            </div>
          {employeeName && (
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-xs text-slate-500">Uploading as</span>
              <strong className="text-slate-900">{employeeName}</strong>
            </div>
          )}

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-slate-500">
              Status for all rows in this file *
            </span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setLocalError('');
              }}
              disabled={uploading}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">Select status…</option>
              <option value="Qualified">Qualified (duplicates are skipped)</option>
              <option value="DisQualified">DisQualified (no duplicate check)</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-slate-500">
              Excel file (.xlsx, max 25 MB) *
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              onChange={pickFile}
              disabled={uploading}
              className="block w-full cursor-pointer rounded-lg border border-slate-300 text-sm text-slate-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          {file && (
            <div className="text-sm text-slate-700">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </div>
          )}

                    {uploading && (
            <div className="grid gap-1.5" aria-label="Import progress">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span>{phase === 'uploading' ? 'Uploading file' : stage || 'Importing'}</span>
                <span>{shownPercent}%</span>
              </div>

              <div className="h-2.5 overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${shownPercent}%` }}
                />
              </div>

              {phase === 'processing' && processed != null && total != null && (
                <div className="text-xs text-slate-500">
                  {processed.toLocaleString()} of {total.toLocaleString()} rows
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-slate-800">
              <strong className="text-green-800">{result.message}</strong>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                <li>Status: {result.selectedStatus}</li>
                <li>Rows in file: {result.totalRows}</li>
                <li>Imported: {result.importedCount}</li>
                {result.failedCount > 0 && <li>Failed: {result.failedCount}</li>}
                {result.duplicateCheckPerformed && (
                  <li>Duplicates skipped: {result.duplicateCount}</li>
                )}
              </ul>

              {duplicates.length > 0 && (
                <div className="mt-3 max-h-52 overflow-auto rounded-md bg-white">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Name</th>
                        <th className="px-2 py-1.5 font-medium">Email</th>
                        <th className="px-2 py-1.5 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicates.slice(0, 100).map((d, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">
                            {`${d.firstName} ${d.lastName}`.trim() || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {d.emailAddress || d.linkedinProfileLink || '—'}
                          </td>
                          <td className="px-2 py-1.5">{d.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.duplicateCount > 100 && (
                    <div className="px-2 py-1.5 text-xs text-slate-500">
                      Showing the first 100 of {result.duplicateCount} duplicates.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={upload}
            disabled={!status || !file || uploading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {uploading ? 'Importing…' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
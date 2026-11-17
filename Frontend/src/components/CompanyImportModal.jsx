import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { importCompanies, resetImport } from '../features/dataSlice';
import { downloadCompanyImportTemplateApi } from '../services/dataService';

const nf = new Intl.NumberFormat('en-IN');
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function ProgressBar({ label, percent, detail }) {
  const pct = Math.min(100, Math.max(0, percent || 0));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="font-bold text-indigo-600 dark:text-indigo-400">{pct}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
    </div>
  );
}

export default function CompanyImportModal({ open, onClose, onDone }) {
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [localError, setLocalError] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const { user } = useSelector((state) => state.auth);
  const { loading, phase, progress, stage, percent, processed, total, result, error } =
    useSelector((state) => state.data.importState);

  const userId = user?._id || user?.id;
  const uploaderName = user?.name || user?.username || user?.email || 'You';
  const displayedError = localError || error;

  if (!open) return null;

  const close = () => {
    if (loading) return; // do not close while importing
    dispatch(resetImport());
    setFile(null);
    setLocalError('');
    if (fileRef.current) fileRef.current.value = '';
    if (result) onDone?.();
    onClose?.();
  };

  const downloadTemplate = async () => {
    setLocalError('');
    setTemplateLoading(true);
    try {
      const blob = await downloadCompanyImportTemplateApi();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Company_Import_Template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setLocalError(
        downloadError?.response?.data?.message ||
          downloadError?.message ||
          'Could not download the company import template.',
      );
    } finally {
      setTemplateLoading(false);
    }
  };

  const selectFile = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    dispatch(resetImport());
    setLocalError('');

    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setFile(null);
      setLocalError('Only .xlsx files are supported.');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setLocalError('File is larger than 100 MB.');
      return;
    }
    setFile(selectedFile);
  };

  const start = () => {
    if (!file) {
      setLocalError('Choose an .xlsx file.');
      return;
    }
    if (!userId) {
      setLocalError('Could not identify the logged-in user. Please log in again.');
      return;
    }
    setLocalError('');
    dispatch(importCompanies({ file, uploadedBy: userId }));
  };

  const uploading = loading && phase === 'uploading';
  const processing = loading && phase === 'processing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Import companies</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload an .xlsx file. Companies with the same name and country are skipped as duplicates.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={loading}
            className="text-xl text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            ×
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 px-3 py-2">
            <span className="text-xs text-slate-600">
                Need a template? Download the latest company fields.
            </span>
            <button
                type="button"
                onClick={downloadTemplate}
                disabled={templateLoading || loading}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline disabled:opacity-50"
            >
                {templateLoading ? 'Preparing…' : '⬇ Download template'}
            </button>
            </div>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
          <span className="text-slate-500 dark:text-slate-400">Uploaded by</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">{uploaderName}</span>
        </div>

        {!result && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              Excel file (.xlsx, max 100 MB)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              disabled={loading}
              onChange={selectFile}
              className="block w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white dark:border-slate-600 dark:text-slate-300"
            />
          </div>
        )}

        {file && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
        )}

        {uploading && <div className="mt-5"><ProgressBar label="Uploading file" percent={progress} /></div>}

        {processing && (
          <div className="mt-5">
            <ProgressBar
              label={stage || 'Processing'}
              percent={percent}
              detail={
                processed != null && total != null
                  ? `${nf.format(processed)} of ${nf.format(total)} rows`
                  : undefined
              }
            />
          </div>
        )}

        {displayedError && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {displayedError}
          </p>
        )}

        {result && (
          <div className="mt-5 space-y-4">
            <ProgressBar label="Import complete" percent={100} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Rows in file', result.totalRows, 'text-slate-900 dark:text-white'],
                ['Imported', result.importedCount, 'text-emerald-600'],
                ['Duplicates', result.duplicateCount, 'text-amber-600'],
                ['Failed / no name', (result.failedCount || 0) + (result.invalidCount || 0), 'text-rose-600'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  <p className={`mt-1 text-xl font-bold ${color}`}>{nf.format(value || 0)}</p>
                </div>
              ))}
            </div>

            {result.duplicates?.length > 0 && (
              <div className="max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.duplicates.map((d, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{d.name}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{d.emailAddress || '-'}</td>
                        <td className="px-3 py-2 text-amber-700 dark:text-amber-400">{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={start}
              disabled={!file || loading}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {loading ? 'Importing…' : 'Start import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
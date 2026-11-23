import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import {
  getRawImportStatusApi,
  importRawExcelApi,
} from '../services/dataService';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function RawExcelImportModal({ resource, onClose, onImported }) {
  const { user } = useSelector((state) => state.auth);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [job, setJob] = useState(null);

  const isProspect = resource === 'prospect';
  const label = isProspect ? 'Prospect' : 'Company';
  const collectionName = isProspect ? 'raw_prospect' : 'raw_Company';
  const uploaderName =
    user?.name || user?.fullName || user?.employeeName || user?.username || 'You';

  const selectFile = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setError('');
    setJob(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setFile(null);
      setError('Only .xlsx files are supported.');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('File is larger than 100 MB.');
      return;
    }
    setFile(selectedFile);
  };

  const startImport = async () => {
    if (!file) {
      setError('Choose an .xlsx file.');
      return;
    }

    setBusy(true);
    setPhase('uploading');
    setUploadPercent(0);
    setError('');
    setJob(null);

    try {
      const { jobId } = await importRawExcelApi(resource, file, setUploadPercent);
      if (!jobId) throw new Error('The server did not start the raw import.');

      setPhase('processing');
      while (true) {
        await pause(700);
        const nextJob = await getRawImportStatusApi(resource, jobId);
        setJob(nextJob);

        if (nextJob.state === 'done') {
          onImported?.(nextJob.result);
          break;
        }
        if (nextJob.state === 'failed') break;
      }
    } catch (importError) {
      setError(
        importError?.response?.data?.message ||
          importError?.message ||
          'Raw Excel import failed.',
      );
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  const percent =
    phase === 'uploading'
      ? uploadPercent
      : Math.min(100, Math.max(0, job?.percent || 0));
  const result = job?.result;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Import raw ${label.toLowerCase()} data`}
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Import raw {label.toLowerCase()} data
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Saves original spreadsheet rows to <code>{collectionName}</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-2xl leading-none text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {isProspect
            ? 'Rows are stored as ordered column/value pairs, preserving spreadsheet cells and status without changing standard Prospect records.'
            : 'Rows are stored as ordered column/value pairs. If an Organization ID matches, the existing Raw Companies row and matching Company record are updated with non-empty recognized fields; new Organization IDs are saved only to Raw Companies.'}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
          <span className="text-slate-500 dark:text-slate-400">Uploaded by</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {uploaderName}
          </span>
        </div>

        {!result && job?.state !== 'failed' && (
          <label className="mt-5 grid gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Excel file (.xlsx, max 100 MB)
            </span>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={selectFile}
              className="block w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
            />
          </label>
        )}

        {file && !result && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
        )}

        {busy && (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {phase === 'uploading'
                  ? 'Uploading file'
                  : job?.stage || 'Processing raw rows'}
              </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {percent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            {phase === 'processing' && job?.processed != null && (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {job.processed.toLocaleString()} of {(job.totalRows || 0).toLocaleString()} rows
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}
        {job?.state === 'failed' && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {job.error || 'Raw import failed.'} Imported before failure: {job.importedCount || 0}.
          </p>
        )}
        {result && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <p className="font-semibold">{result.message || 'Raw import completed.'}</p>
            <p className="mt-1">
              {result.importedCount.toLocaleString()} new rows saved to {result.collectionName}.
            </p>
            {resource === 'company' && (
              <p className="mt-1">
                Updated {result.updatedRawCount || 0} Raw Companies row(s) and{' '}
                {result.updatedCompanyCount || 0} Company record(s) by Organization ID.
              </p>
            )}
            {result.changedFields?.length > 0 && (
              <details className="mt-3 rounded-lg bg-white/70 p-3 dark:bg-slate-900/40">
                <summary className="cursor-pointer font-semibold">
                  View changed fields ({result.changedFieldsTotal})
                </summary>
                <div className="mt-2 max-h-48 space-y-3 overflow-auto text-xs">
                  {result.changedFields.map((record) => (
                    <div key={record.organizationId}>
                      <p className="font-semibold">
                        Organization ID: {record.organizationId}
                      </p>
                      {[['Company', record.company], ['Raw Companies', record.rawCompanies]]
                        .filter(([, changes]) => changes?.length)
                        .map(([label, changes]) => (
                          <div key={label} className="mt-1">
                            <span className="font-medium">{label}:</span>{' '}
                            {changes
                              .map(
                                ({ field, from, to }) =>
                                  `${field}: ${from || '—'} → ${to || '—'}`,
                              )
                              .join('; ')}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && job?.state !== 'failed' && (
            <button
              type="button"
              onClick={startImport}
              disabled={!file || busy}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {busy ? 'Importing…' : 'Start raw import'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

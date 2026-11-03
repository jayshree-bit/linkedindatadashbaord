export default function ChangeDiff({ changes = [], reason = "" }) {
  if (!changes.length) {
    return (
      <span className="text-gray-500 dark:text-gray-400">
        {reason || "No changes"}
      </span>
    );
  }
  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-gray-500 dark:text-gray-400">
            <th className="py-1 pr-3 font-semibold">Field</th>
            <th className="py-1 pr-3 font-semibold">Old value</th>
            <th className="py-1 font-semibold">New value</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.field} className="border-t border-gray-100 align-top dark:border-gray-700">
              <td className="py-1 pr-3 font-medium capitalize">{c.label}</td>
              <td className="py-1 pr-3">
                {c.old ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through dark:bg-red-500/15 dark:text-red-300">
                    {c.old}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="py-1">
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                  {c.new}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {reason && (
        <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">{reason}</div>
      )}
    </div>
  );
}
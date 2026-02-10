import { useEffect, useMemo, useState } from 'react';

function App() {
  const [claims, setClaims] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingClaim, setEditingClaim] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadClaims() {
      try {
        const response = await fetch('/api/claims');
        if (!response.ok) {
          throw new Error('Could not load claims');
        }
        const data = await response.json();
        setClaims(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadClaims();
  }, []);

  const columns = useMemo(() => (claims[0] ? Object.keys(claims[0]) : []), [claims]);
  const editableColumns = useMemo(() => columns.filter((column) => column !== '_rowid_'), [columns]);

  const filteredClaims = useMemo(() => {
    if (!query.trim()) {
      return claims;
    }

    const needle = query.toLowerCase();
    return claims.filter((claim) =>
      Object.values(claim).some((value) => String(value ?? '').toLowerCase().includes(needle))
    );
  }, [claims, query]);

  function openEditModal(claim) {
    setEditingClaim(claim);
    const draft = {};
    editableColumns.forEach((column) => {
      draft[column] = String(claim[column] ?? '');
    });
    setEditDraft(draft);
    setError('');
  }

  function closeEditModal() {
    setEditingClaim(null);
    setEditDraft({});
    setIsSaving(false);
  }

  async function saveEdit() {
    if (!editingClaim?._rowid_) {
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/claims/${editingClaim._rowid_}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editDraft)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save row');
      }

      const updatedRow = await response.json();
      setClaims((previous) =>
        previous.map((claim) => (claim._rowid_ === updatedRow._rowid_ ? updatedRow : claim))
      );
      closeEditModal();
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-7xl rounded-xl bg-white p-6 shadow-lg">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reported Claims</h1>
            <p className="mt-1 text-sm text-slate-500">Table: reklamacje</p>
          </div>

          <div className="w-full md:max-w-sm">
            <label htmlFor="filter" className="mb-1 block text-sm font-medium text-slate-700">
              Search all fields
            </label>
            <input
              id="filter"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type to filter rows..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </header>

        {loading ? <p className="text-slate-500">Loading claims...</p> : null}
        {error ? <p className="mb-3 font-medium text-red-600">{error}</p> : null}

        {!loading && !error && (
          <p className="mb-3 text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{filteredClaims.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{claims.length}</span> rows
          </p>
        )}

        {!loading && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-600">
                      {column}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-600">actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredClaims.map((claim, index) => {
                  const rowId = claim._rowid_ ?? index;

                  return (
                    <tr key={rowId} className="hover:bg-slate-50">
                      {columns.map((column) => (
                        <td key={`${rowId}-${column}`} className="px-4 py-3 align-top text-slate-700">
                          {String(claim[column] ?? '')}
                        </td>
                      ))}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(claim)}
                          className="rounded border border-blue-300 px-3 py-1.5 text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredClaims.length && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={Math.max(columns.length + 1, 1)}>
                      No rows match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Edit claim</h2>
                <p className="text-sm text-slate-500">Row ID: {editingClaim._rowid_}</p>
              </div>
              <button
                onClick={closeEditModal}
                disabled={isSaving}
                className="rounded border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {editableColumns.map((column) => (
                  <div key={column} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-700">{column}</label>
                    <input
                      value={editDraft[column] ?? ''}
                      onChange={(event) =>
                        setEditDraft((draft) => ({
                          ...draft,
                          [column]: event.target.value
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                onClick={closeEditModal}
                disabled={isSaving}
                className="rounded border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={isSaving}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

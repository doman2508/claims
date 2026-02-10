import { useEffect, useMemo, useState } from 'react';

function App() {
  const [claims, setClaims] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const filteredClaims = useMemo(() => {
    if (!query.trim()) {
      return claims;
    }

    const needle = query.toLowerCase();
    return claims.filter((claim) =>
      Object.values(claim).some((value) => String(value ?? '').toLowerCase().includes(needle))
    );
  }, [claims, query]);

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
        {error ? <p className="font-medium text-red-600">{error}</p> : null}

        {!loading && !error && (
          <>
            <p className="mb-3 text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-700">{filteredClaims.length}</span> of{' '}
              <span className="font-semibold text-slate-700">{claims.length}</span> rows
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-600">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredClaims.map((claim, index) => (
                    <tr key={claim.id ?? index} className="hover:bg-slate-50">
                      {columns.map((column) => (
                        <td key={`${claim.id ?? index}-${column}`} className="px-4 py-3 align-top text-slate-700">
                          {String(claim[column] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!filteredClaims.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={Math.max(columns.length, 1)}>
                        No rows match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default App;

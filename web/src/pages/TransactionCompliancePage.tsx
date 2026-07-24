import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { listSanctionsScreenings, triggerSanctionsScreening } from '../api/sanctionsScreening';
import type { SanctionsScreening } from '../api/types';

export function TransactionCompliancePage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [screenings, setScreenings] = useState<SanctionsScreening[] | null>(null);
  const [partyScreened, setPartyScreened] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function refresh() {
    if (!tradeId) return;
    setError(null);
    try {
      setScreenings(await listSanctionsScreenings(tradeId));
      setError(null);
    } catch {
      setError("Couldn't load the sanctions screenings. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tradeId || !partyScreened) return;
    setSubmitError(null);
    try {
      await triggerSanctionsScreening(tradeId, { party_screened: partyScreened });
      setPartyScreened('');
      await refresh();
    } catch {
      setSubmitError("Couldn't run the screening. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (screenings === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Compliance</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-2 max-w-md">
        <div className="flex-1">
          <label htmlFor="partyScreened" className="block text-xs font-semibold text-ink-soft mb-1">
            Party to screen
          </label>
          <input
            id="partyScreened"
            value={partyScreened}
            onChange={(e) => setPartyScreened(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded"
            required
          />
        </div>
        <button type="submit" className="self-end bg-ink text-paper-2 rounded px-4 py-2 font-semibold h-fit">
          Run screening
        </button>
      </form>
      {submitError && <p className="text-block text-sm mb-4">{submitError}</p>}
      {screenings.length === 0 ? (
        <p className="text-ink-soft">No screenings yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-soft border-b border-line">
              <th className="py-2">Party</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {screenings.map((screening) => (
              <tr key={screening.id} className="border-b border-line-soft">
                <td className="py-2">{screening.party_screened}</td>
                <td className="py-2">{screening.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

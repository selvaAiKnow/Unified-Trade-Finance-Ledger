import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createTrade } from '../api/trades';
import type { TradeCreate } from '../api/types';
import { Panel } from '../components/ui/Panel';

const emptyForm: TradeCreate = {
  lc_reference: '',
  industry: '',
  instrument_type: '',
  exporter_org_id: '',
  buyer_org_id: '',
  issuing_bank_org_id: '',
  advising_bank_org_id: '',
  product_description: '',
  order_value: 0,
  currency: '',
  incoterm: '',
  payment_term: '',
};

const fieldLabels: Array<{ key: keyof TradeCreate; label: string; type?: string }> = [
  { key: 'lc_reference', label: 'LC reference' },
  { key: 'industry', label: 'Industry' },
  { key: 'instrument_type', label: 'Instrument type' },
  { key: 'exporter_org_id', label: 'Exporter org ID' },
  { key: 'buyer_org_id', label: 'Buyer org ID' },
  { key: 'issuing_bank_org_id', label: 'Issuing bank org ID' },
  { key: 'advising_bank_org_id', label: 'Advising bank org ID' },
  { key: 'product_description', label: 'Product description' },
  { key: 'order_value', label: 'Order value', type: 'number' },
  { key: 'currency', label: 'Currency' },
  { key: 'incoterm', label: 'Incoterm' },
  { key: 'payment_term', label: 'Payment term' },
];

export function NewTransactionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TradeCreate>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof TradeCreate, value: string) {
    setForm((prev) => ({ ...prev, [key]: key === 'order_value' ? Number(value) : value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const trade = await createTrade(form);
      navigate(`/transactions/${trade.id}/overview`);
    } catch {
      setError('Could not create the transaction. Please check the details and try again.');
    }
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Start a new transaction</h1>
      <Panel className="max-w-2xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          {fieldLabels.map(({ key, label, type }) => (
            <div key={key}>
              <label htmlFor={key} className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                {label}
              </label>
              <input
                id={key}
                type={type ?? 'text'}
                value={form[key] as string | number}
                onChange={(e) => updateField(key, e.target.value)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              />
            </div>
          ))}
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Create transaction
          </button>
        </form>
      </Panel>
    </div>
  );
}

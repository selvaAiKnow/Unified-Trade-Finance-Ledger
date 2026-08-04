import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { getOrganization } from '../api/organizations';
import { createTrade } from '../api/trades';
import type { TradeCreate } from '../api/types';
import { OrgPicker } from '../components/OrgPicker';
import { TRADE_INDUSTRY_OPTIONS } from '../components/SignupForm';
import { Panel } from '../components/ui/Panel';
import { useAuthStore } from '../stores/AuthContext';

const INSTRUMENT_TYPE_OPTIONS = ['Letter of Credit', 'Documentary Collection', 'Open Account'];
const CURRENCY_OPTIONS = ['INR', 'JPY'];

type TradeRole = 'exporter' | 'importer';

const COUNTERPARTY_FIELD_KEYS: Array<keyof TradeCreate> = [
  'exporter_org_id',
  'buyer_org_id',
  'issuing_bank_org_id',
  'advising_bank_org_id',
];

const emptyForm: TradeCreate = {
  lc_reference: '',
  industry: TRADE_INDUSTRY_OPTIONS[0],
  instrument_type: INSTRUMENT_TYPE_OPTIONS[0],
  exporter_org_id: '',
  buyer_org_id: '',
  issuing_bank_org_id: '',
  advising_bank_org_id: '',
  product_description: '',
  order_value: 0,
  currency: CURRENCY_OPTIONS[0],
  incoterm: '',
  payment_term: '',
  shipment_deadline: '',
};

function FieldWrapper({ htmlFor, label, children }: { htmlFor?: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  fullWidth = false,
}: {
  id: string;
  label: string;
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'col-span-2' : undefined}>
      <FieldWrapper htmlFor={id} label={label}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 border border-line-strong rounded"
          required
        />
      </FieldWrapper>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <FieldWrapper htmlFor={id} label={label}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-line-strong rounded"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

export function NewTransactionPage() {
  const navigate = useNavigate();
  const auth = useAuthStore();
  const user = auth.user!;

  const [tradeRole, setTradeRole] = useState<TradeRole | null>(null);
  const selfField: keyof TradeCreate | null =
    tradeRole === 'exporter' ? 'exporter_org_id' : tradeRole === 'importer' ? 'buyer_org_id' : null;

  const [form, setForm] = useState<TradeCreate>(emptyForm);
  const [selfOrgName, setSelfOrgName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selfField) return;
    setForm((prev) => ({ ...prev, [selfField]: user.org_id! }));
    getOrganization(user.org_id!).then((org) => setSelfOrgName(org.name));
  }, [selfField, user.org_id]);

  function handleChangeTradeRole() {
    setTradeRole(null);
    setSelfOrgName(null);
    setForm(emptyForm);
  }

  function updateField(key: keyof TradeCreate, value: string) {
    setForm((prev) => ({ ...prev, [key]: key === 'order_value' ? Number(value) : value }));
  }

  function renderCounterpartyField(key: keyof TradeCreate, label: string) {
    if (key === selfField) {
      return (
        <FieldWrapper key={key} label={label}>
          <div className="w-full px-3 py-2.5 border border-line rounded bg-line-soft text-ink-soft">
            {selfOrgName ?? 'Loading…'}
          </div>
        </FieldWrapper>
      );
    }
    return (
      <OrgPicker key={key} id={key} label={label} value={form[key] as string} onChange={(orgId) => updateField(key, orgId)} />
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (COUNTERPARTY_FIELD_KEYS.some((key) => !form[key])) {
      setError('Please select each organization from the list.');
      return;
    }
    try {
      const trade = await createTrade(form);
      navigate(`/transactions/${trade.id}/overview`);
    } catch {
      setError('Could not create the transaction. Please check the details and try again.');
    }
  }

  if (!tradeRole) {
    return (
      <div>
        <h1 className="font-serif text-2xl mb-4">Start a new transaction</h1>
        <Panel className="max-w-md">
          <p className="text-sm text-ink-soft mb-4">Are you the Exporter or Importer in this transaction?</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTradeRole('exporter')}
              className="flex-1 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark"
            >
              Exporter
            </button>
            <button
              type="button"
              onClick={() => setTradeRole('importer')}
              className="flex-1 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark"
            >
              Importer
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between max-w-2xl mb-4">
        <h1 className="font-serif text-2xl">Start a new transaction</h1>
        <button type="button" onClick={handleChangeTradeRole} className="text-xs text-seal-dark hover:underline">
          Change ({tradeRole === 'exporter' ? 'Exporter' : 'Importer'})
        </button>
      </div>
      <Panel className="max-w-7xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          {renderCounterpartyField('exporter_org_id', 'Exporter')}
          {renderCounterpartyField('buyer_org_id', 'Importer')}
          <SelectField
            id="industry"
            label="Industry"
            value={form.industry}
            options={TRADE_INDUSTRY_OPTIONS}
            onChange={(value) => updateField('industry', value)}
          />
          <SelectField
            id="instrument_type"
            label="Instrument type"
            value={form.instrument_type}
            options={INSTRUMENT_TYPE_OPTIONS}
            onChange={(value) => updateField('instrument_type', value)}
          />
          <TextField id="lc_reference" label="LC reference" value={form.lc_reference} onChange={(value) => updateField('lc_reference', value)} />
          {renderCounterpartyField('issuing_bank_org_id', 'Issuing bank')}
          {renderCounterpartyField('advising_bank_org_id', 'Advising bank')}
          <TextField id="incoterm" label="Incoterm" value={form.incoterm} onChange={(value) => updateField('incoterm', value)} />
          <SelectField
            id="currency"
            label="Currency"
            value={form.currency}
            options={CURRENCY_OPTIONS}
            onChange={(value) => updateField('currency', value)}
          />
          <TextField
            id="order_value"
            label="Order value"
            type="number"
            value={form.order_value}
            onChange={(value) => updateField('order_value', value)}
          />
          <TextField id="payment_term" label="Payment term" value={form.payment_term} onChange={(value) => updateField('payment_term', value)} />
          <TextField
            id="shipment_deadline"
            label="Shipment deadline"
            type="date"
            value={form.shipment_deadline}
            onChange={(value) => updateField('shipment_deadline', value)}
          />
          <TextField
            id="product_description"
            label="Product description"
            value={form.product_description}
            onChange={(value) => updateField('product_description', value)}
            fullWidth
          />
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <div className="col-span-2 flex justify-end">
            <button type="submit" className="w-auto inline-block justify-self-start bg-seal text-white rounded px-4 py-2 text-sm font-medium hover:bg-seal-dark">
              Create transaction
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

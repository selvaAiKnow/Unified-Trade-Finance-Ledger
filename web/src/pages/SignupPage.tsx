import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { signup } from '../api/auth';
import type { OrgType, SignupResponse } from '../api/types';

export function SignupPage() {
  const [step, setStep] = useState<'account' | 'verify'>('account');
  const [form, setForm] = useState({
    orgName: '',
    orgType: 'EXPORTER' as OrgType,
    country: '',
    industry: '',
    taxId: '',
    adminName: '',
    adminEmail: '',
    password: '',
  });
  const [result, setResult] = useState<SignupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccountSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await signup({
        organization: {
          name: form.orgName,
          org_type: form.orgType,
          country: form.country,
          industry: form.industry,
          tax_id: form.taxId,
        },
        admin_user: {
          name: form.adminName,
          email: form.adminEmail,
          password: form.password,
        },
      });
      setResult(response);
      setStep('verify');
    } catch {
      setError('Could not create your organization. Please check your details and try again.');
    }
  }

  if (step === 'verify' && result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
        <div className="w-full max-w-md bg-paper-2 border border-line rounded-xl p-8 text-center">
          <h2 className="font-serif text-xl mb-2">Organization verified</h2>
          <p className="text-ink-soft mb-4">
            {result.organization.name} — KYB status: <strong>{result.organization.kyb_status}</strong>
          </p>
          <Link to="/login" className="inline-block bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper">
      <div className="w-full max-w-lg bg-paper-2 border border-line rounded-xl p-8">
        <h2 className="font-serif text-xl mb-4">Create your organization account</h2>
        <form onSubmit={handleAccountSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="orgName" className="block text-xs font-semibold text-ink-soft mb-1">
              Organization name
            </label>
            <input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="orgType" className="block text-xs font-semibold text-ink-soft mb-1">
              Organization type
            </label>
            <select
              id="orgType"
              value={form.orgType}
              onChange={(e) => setForm({ ...form, orgType: e.target.value as OrgType })}
              className="w-full px-3 py-2 border border-line rounded"
            >
              <option value="EXPORTER">Exporter</option>
              <option value="BUYER">Buyer / Importer</option>
              <option value="BANK">Bank</option>
            </select>
          </div>
          <div>
            <label htmlFor="country" className="block text-xs font-semibold text-ink-soft mb-1">
              Country
            </label>
            <input
              id="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="industry" className="block text-xs font-semibold text-ink-soft mb-1">
              Industry
            </label>
            <input
              id="industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="taxId" className="block text-xs font-semibold text-ink-soft mb-1">
              Tax / business ID
            </label>
            <input
              id="taxId"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="adminName" className="block text-xs font-semibold text-ink-soft mb-1">
              Admin name
            </label>
            <input
              id="adminName"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="adminEmail" className="block text-xs font-semibold text-ink-soft mb-1">
              Admin email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink-soft mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded"
              required
            />
          </div>
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-ink text-paper-2 rounded py-2 font-semibold">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

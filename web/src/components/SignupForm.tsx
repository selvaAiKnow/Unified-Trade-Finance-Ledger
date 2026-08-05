import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { signup } from '../api/auth';
import type { OrgType, SignupResponse } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from './ui/Badge';
import { Panel } from './ui/Panel';

const COUNTRY_OPTIONS = ['India', 'Japan'];

export const TRADE_INDUSTRY_OPTIONS = [
  'Pharmaceuticals',
  'Textiles & Apparel',
  'Electronics & Electrical Equipment',
  'Automotive & Auto Components',
  'Chemicals & Petrochemicals',
  'Agriculture & Food Products',
  'Machinery & Industrial Equipment',
  'Steel & Metals',
  'Oil & Gas / Energy',
];

export interface SignupFormProps {
  heading: string;
  subheading: string;
  orgTypeOptions: Array<{ value: OrgType; label: string }>;
  orgNameLabel?: string;
  successHeading?: string;
  errorMessage?: string;
  industryOptions?: string[];
}

export function SignupForm({
  heading,
  subheading,
  orgTypeOptions,
  orgNameLabel = 'Organization name',
  successHeading = 'Organization verified',
  errorMessage = 'Could not create your organization. Please check your details and try again.',
  industryOptions,
}: SignupFormProps) {
  const [step, setStep] = useState<'account' | 'verify'>('account');
  const [form, setForm] = useState({
    orgName: '',
    orgType: orgTypeOptions[0].value,
    country: COUNTRY_OPTIONS[0],
    industry: industryOptions?.[0] ?? '',
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
      setError(errorMessage);
    }
  }

  if (step === 'verify' && result) {
    const kyb = kybStatusInfo(result.organization.kyb_status);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper py-10">
        <div className="w-full max-w-md bg-paper-2 border border-line p-8 text-center">
          <h2 className="font-serif text-xl mb-2">{successHeading}</h2>
          <p className="text-ink-soft mb-4">{result.organization.name}</p>
          <div className="flex justify-center mb-5">
            <Badge tone={kyb.tone}>KYB status: {kyb.label}</Badge>
          </div>
          <Panel noPadding className="text-left mb-5">
            <div className="divide-y divide-line">
              {result.kyb_checks.map((check) => {
                const checkStatus = kybCheckStatusInfo(check.status);
                return (
                  <div key={check.id} className="flex items-center justify-between px-6 py-3.5">
                    <span className="text-sm">{check.check_type}</span>
                    <Badge tone={checkStatus.tone}>{checkStatus.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Link to="/login" className="inline-block bg-seal text-white rounded px-4 py-2 font-semibold hover:bg-seal-dark">
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper py-10">
      <div className="w-full max-w-lg bg-paper-2 border border-line p-8">
        <h2 className="font-serif text-xl mb-1">{heading}</h2>
        <p className="text-ink-soft text-sm mb-4">{subheading}</p>
        <form onSubmit={handleAccountSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="orgName" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              {orgNameLabel}
            </label>
            <input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {orgTypeOptions.length > 1 && (
            <div>
              <label htmlFor="orgType" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Organization type
              </label>
              <select
                id="orgType"
                value={form.orgType}
                onChange={(e) => setForm({ ...form, orgType: e.target.value as OrgType })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                {orgTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="country" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Country
            </label>
            <select
              id="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="industry" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Industry
            </label>
            {industryOptions ? (
              <select
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              />
            )}
          </div>
          <div>
            <label htmlFor="taxId" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Tax / business ID
            </label>
            <input
              id="taxId"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="adminName" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Admin name
            </label>
            <input
              id="adminName"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="adminEmail" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Admin email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Continue
          </button>
        </form>
        <p className="text-center text-sm text-ink-soft mt-5 pt-4 border-t border-line">
          Already have an account?{' '}
          <Link to="/login" className="text-seal font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

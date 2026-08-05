import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';

import { getOrganization, listOrganizationKybChecks, uploadBusinessRegistrationDocument } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { useAuthStore } from '../stores/AuthContext';

export const KycPage = observer(function KycPage() {
  const auth = useAuthStore();
  const user = auth.user!;

  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const [fetchedOrg, fetchedKybChecks] = await Promise.all([
        getOrganization(user.org_id),
        listOrganizationKybChecks(user.org_id),
      ]);
      setOrg(fetchedOrg);
      setKybChecks(fetchedKybChecks);
    } catch {
      setLoadError("Couldn't load your verification status. Please try again.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.org_id]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setUploadError(null);
    if (!file) {
      setUploadError('Please choose a file to upload.');
      return;
    }
    setUploading(true);
    try {
      await uploadBusinessRegistrationDocument(user.org_id, file);
      setFile(null);
      await load();
    } catch {
      setUploadError('Could not upload the document. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const businessRegistrationCheck = kybChecks.find((check) => check.check_type === 'BUSINESS_REGISTRATION');
  const needsDocument = businessRegistrationCheck?.status === 'PENDING';

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">KYC verification</h1>

      {loadError && <p className="text-block text-sm max-w-md">{loadError}</p>}

      {org && (
        <Panel title="KYB verification" noPadding className="max-w-md">
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-line">
            <span className="text-sm text-ink-soft">Overall status</span>
            <Badge tone={kybStatusInfo(org.kyb_status).tone}>{kybStatusInfo(org.kyb_status).label}</Badge>
          </div>
          <div className="divide-y divide-line">
            {kybChecks.map((check) => {
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
      )}

      {needsDocument && (
        <Panel title="Upload business registration certificate" className="max-w-md">
          <form onSubmit={handleUpload} className="flex flex-col gap-3">
            <div>
              <label htmlFor="businessRegistrationDocument" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Business registration certificate
              </label>
              <input
                id="businessRegistrationDocument"
                type="file"
                accept="image/*,application/pdf"
                aria-required="true"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              />
            </div>
            {uploadError && <p className="text-block text-sm">{uploadError}</p>}
            <button
              type="submit"
              disabled={uploading}
              className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload certificate'}
            </button>
          </form>
        </Panel>
      )}
    </div>
  );
});

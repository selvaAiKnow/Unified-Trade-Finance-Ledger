import { useEffect, useState } from 'react';

import {
  decideAdminKybCheck,
  getBusinessRegistrationDocumentBlob,
  listAdminBusinessRegistrationChecks,
  listAdminOrganizations,
  listAdminUsers,
} from '../api/admin';
import type { KybCheck, Organization, User } from '../api/types';
import { kybCheckStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminKycReviewPage() {
  const [checks, setChecks] = useState<KybCheck[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [fetchedChecks, fetchedOrgs, fetchedUsers] = await Promise.all([
        listAdminBusinessRegistrationChecks(),
        listAdminOrganizations(),
        listAdminUsers(),
      ]);
      setChecks(fetchedChecks);
      setOrganizations(fetchedOrgs);
      setUsers(fetchedUsers);
    } catch {
      setError("Couldn't load KYC checks. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function orgName(orgId: string): string {
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  function uploaderName(userId: string | null): string {
    if (!userId) return '—';
    return users.find((user) => user.id === userId)?.name ?? userId;
  }

  async function handleViewDocument(checkId: string) {
    setError(null);
    const newTab = window.open('', '_blank');
    try {
      const blob = await getBusinessRegistrationDocumentBlob(checkId);
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      }
    } catch {
      newTab?.close();
      setError("Couldn't load the document. Please try again.");
    }
  }

  async function handleDecision(checkId: string, decision: 'PASSED' | 'FAILED') {
    setError(null);
    try {
      const updated = await decideAdminKybCheck(checkId, decision);
      setChecks((current) => current?.map((c) => (c.id === checkId ? updated : c)) ?? current);
    } catch {
      setError("Couldn't record the decision. Please try again.");
    }
  }

  if (error && checks === null) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (checks === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">KYC Review</h1>
      {error && <p className="text-block text-sm mb-4">{error}</p>}
      {checks.length === 0 ? (
        <p className="text-ink-soft">No business registration checks yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Organization</th>
                <th className="py-2.5 px-6">Uploaded by</th>
                <th className="py-2.5 px-6">AI summary</th>
                <th className="py-2.5 px-6">Status</th>
                <th className="py-2.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => {
                const statusInfo = kybCheckStatusInfo(check.status);
                return (
                  <tr key={check.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{orgName(check.org_id)}</td>
                    <td className="py-3 px-6">{uploaderName(check.uploaded_by)}</td>
                    <td className="py-3 px-6 text-ink-soft max-w-xs">{check.ai_summary ?? '—'}</td>
                    <td className="py-3 px-6">
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        {check.detail && (
                          <button
                            type="button"
                            onClick={() => handleViewDocument(check.id)}
                            className="text-seal text-xs font-semibold hover:underline"
                          >
                            View document
                          </button>
                        )}
                        {check.status === 'FLAGGED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDecision(check.id, 'PASSED')}
                              aria-label={`Approve ${orgName(check.org_id)}`}
                              className="text-verified text-xs font-semibold hover:underline"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDecision(check.id, 'FAILED')}
                              aria-label={`Reject ${orgName(check.org_id)}`}
                              className="text-block text-xs font-semibold hover:underline"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

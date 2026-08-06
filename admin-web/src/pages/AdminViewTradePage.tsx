import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getAdminTrade, listAdminOrganizations } from '../api/admin';
import type { Organization, Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminViewTradePage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    Promise.all([getAdminTrade(tradeId), listAdminOrganizations()])
      .then(([fetchedTrade, orgs]) => {
        setTrade(fetchedTrade);
        setOrganizations(orgs);
      })
      .catch(() => setError("Couldn't load this trade. Please try again."));
  }, [tradeId]);

  function orgName(orgId: string): string {
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trade === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const status = tradeStatusInfo(trade.status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">{trade.lc_reference}</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Status</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Industry</span>
            <span className="font-semibold">{trade.industry}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Instrument type</span>
            <span className="font-semibold">{trade.instrument_type}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Product description</span>
            <span className="font-semibold text-right">{trade.product_description}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Order value</span>
            <span className="font-mono">
              {trade.currency} {trade.order_value.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Incoterm</span>
            <span className="font-semibold">{trade.incoterm}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Payment term</span>
            <span className="font-semibold">{trade.payment_term}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Shipment deadline</span>
            <span className="font-semibold">{trade.shipment_deadline ?? '—'}</span>
          </div>
        </div>
      </Panel>

      <Panel title="Participants" className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Exporter</span>
            <span className="font-semibold">{orgName(trade.exporter_org_id)}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Buyer</span>
            <span className="font-semibold">{orgName(trade.buyer_org_id)}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Issuing bank</span>
            <span className="font-semibold">{orgName(trade.issuing_bank_org_id)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Advising bank</span>
            <span className="font-semibold">{orgName(trade.advising_bank_org_id)}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

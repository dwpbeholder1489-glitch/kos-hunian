'use client';

import { useKos } from '@/components/KosProvider';
import KasirDemo from '@/components/KasirDemo';
import { isDraft, pathAllowed } from '@/lib/business';

export default function KasirDemoPage() {
  const { kos, session } = useKos();
  if (!kos || !session || kos.business_type !== 'retail' || isDraft(kos) || kos.suspended_at || !pathAllowed(kos, '/kasir')) return null;
  const scope = session.user.id + ':' + kos.id;
  return <KasirDemo key={scope} kos={kos} userId={session.user.id} scope={scope} />;
}

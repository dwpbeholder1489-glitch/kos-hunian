'use client';

import { useKos } from '@/components/KosProvider';
import LearningCenter from '@/components/LearningCenter';

export default function LearningPage() {
  const { kos, session } = useKos();
  if (!kos || !session) return null;
  return <LearningCenter key={`${session.user.id}:${kos.id}`} kos={kos} scope={`${session.user.id}:${kos.id}`} />;
}

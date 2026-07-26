import { useEffect, useState } from 'react';
import { onSyncStatusChange, type SyncStatus } from '../db/sync';
import { isSupabaseConfigured } from '../lib/supabase';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => onSyncStatusChange((s, t) => {
    setStatus(s);
    setLastSync(t);
  }), []);

  return { status, lastSync, configured: isSupabaseConfigured };
}
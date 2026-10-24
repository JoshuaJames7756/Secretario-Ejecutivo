import { useCallback, useEffect, useState } from 'react';
import { getStorageStatus, requestPersistence, type StorageStatus } from '@/lib/storage';

export function useStorageStatus() {
  const [status, setStatus] = useState<StorageStatus | undefined>();

  useEffect(() => {
    let cancelled = false;
    void getStorageStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async () => {
    const granted = await requestPersistence();
    setStatus(await getStorageStatus());
    return granted;
  }, []);

  return { status, request };
}

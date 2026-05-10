import { useState, useEffect, useCallback, useRef } from 'react';

export function usePoll<T>(
  fetcher: () => Promise<T>,
  interval: number = 3000,
  enabled: boolean = true
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const runRefresh = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    void runRefresh(true);
  }, [runRefresh]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void runRefresh(true);
    const timer = setInterval(() => {
      void runRefresh(false);
    }, interval);
    return () => clearInterval(timer);
  }, [runRefresh, interval, enabled]);

  return { data, loading, error, refresh };
}

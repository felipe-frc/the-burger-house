import { useCallback, useEffect, useRef, useState } from 'react';

export function useUndoQueue() {
  const scheduled = useRef(new Map<string, { timer: number; resolve: (result: boolean) => void }>());
  const [actions, setActions] = useState<{ key: string; title: string }[]>([]);
  const remove = useCallback((key: string) => {
    scheduled.current.delete(key);
    setActions(rows => rows.filter(row => row.key !== key));
  }, []);

  const cancel = useCallback((key: string) => {
    const action = scheduled.current.get(key);
    if (!action) return;
    window.clearTimeout(action.timer);
    remove(key);
    action.resolve(false);
  }, [remove]);

  const clear = useCallback(() => {
    for (const key of scheduled.current.keys()) cancel(key);
  }, [cancel]);
  useEffect(() => clear, [clear]);

  const schedule = useCallback((key: string, title: string, action: () => Promise<boolean>) => {
    if (scheduled.current.has(key)) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      const timer = window.setTimeout(() => {
        remove(key);
        void action().then(resolve, () => resolve(false));
      }, 5000);
      scheduled.current.set(key, { timer, resolve });
      setActions(rows => [...rows, { key, title }]);
    });
  }, [remove]);

  return { actions, cancel, clear, schedule };
}

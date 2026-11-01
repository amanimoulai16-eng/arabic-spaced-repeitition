import { useState, useEffect, useCallback } from 'react';

import { registerSW } from 'virtual:pwa-register';

type SWState = {
  needRefresh: boolean;
  update: () => Promise<void>;
};

let swState: SWState = { needRefresh: false, update: async () => {} };

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(swState.needRefresh);

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        swState = { needRefresh: true, update: updateSW };
        setNeedRefresh(true);
      },
      onOfflineReady() {
        // no-op
      },
    });
    swState = { needRefresh: swState.needRefresh, update: updateSW };
  }, []);

  const update = useCallback(async () => {
    await swState.update(true);
  }, []);

  const dismiss = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  return { needRefresh, update, dismiss };
}

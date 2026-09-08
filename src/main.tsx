import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

import { supabase } from '@/lib/supabase';

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    // نخزن حالة الاستعادة في localStorage أو في حالة عامة
    localStorage.setItem('recovery_mode', 'true');
    window.dispatchEvent(new CustomEvent('recovery-requested'));
   }
 ),   
}  
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';
import { initErrorCapturing } from './lib/logger';
import { ConfirmProvider } from './hooks/useConfirm';

// Start real-time error capture
initErrorCapturing();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </StrictMode>,
);


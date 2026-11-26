import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './workspace/Root';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

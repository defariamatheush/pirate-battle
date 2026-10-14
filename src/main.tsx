import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './api/queryClient';
import { startMocks } from './mocks/browser';
import './styles.css';

async function bootstrap() {
  // The mocked REST API is part of the product (also in production builds).
  try {
    await startMocks();
  } catch (error) {
    console.warn('Mock API could not start; ranking and history will show errors.', error);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();

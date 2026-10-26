import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './styles.css';
import './auth.css';
import './dashboard.css';
import './events.css';
import './discovery.css';
import './reservations.css';
import './payments.css';
import './tickets.css';
import { AuthProvider } from './context/AuthProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter useTransitions={false}><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>
);

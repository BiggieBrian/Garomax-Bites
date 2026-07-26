import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { seedInitialData } from './db/seedLocalData'
import { startSync } from './db/sync'

// Initialize local Dexie database, then bring in/wire up Supabase sync
seedInitialData().then(() => startSync());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
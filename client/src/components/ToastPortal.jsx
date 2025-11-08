import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

function Toast({ t, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, t.duration || 3000);
    return () => clearTimeout(timer);
  }, [t, onClose]);
  const color = t.type === 'success' ? 'text-green-400' : t.type === 'error' ? 'text-red-400' : 'text-blue-400';
  const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? AlertCircle : Info;
  return (
    <div className="pointer-events-auto flex items-center gap-2 bg-dark-card border border-dark-border rounded-lg px-3 py-2 shadow-lg">
      <Icon className={`w-4 h-4 ${color}`} />
      <div className="text-sm">{t.message}</div>
    </div>
  );
}

export default function ToastPortal() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    function pushToast(e) {
      const payload = typeof e.detail === 'string' ? { message: e.detail } : (e.detail || {});
      const t = {
        id: Math.random().toString(36).slice(2),
        type: payload.type || 'info',
        message: payload.message || '',
        duration: payload.duration || 3000
      };
      setToasts(prev => [...prev, t].slice(-5));
    }
    window.toast = (msg, type = 'info', duration = 3000) => {
      const evt = new CustomEvent('app:toast', { detail: { message: msg, type, duration } });
      window.dispatchEvent(evt);
    };
    window.addEventListener('app:toast', pushToast);
    return () => window.removeEventListener('app:toast', pushToast);
  }, []);

  return (
    <div className="fixed z-[10000] right-4 bottom-4 space-y-2 pointer-events-none">
      {toasts.map(t => (
        <Toast key={t.id} t={t} onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
}
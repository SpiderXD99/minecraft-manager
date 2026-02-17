import { createContext, useContext, useState, useEffect } from 'react';

const ConfigContext = createContext({
  baseDomain: 'example.com',
  mcDomain: 'mc.example.com',
  loading: true,
});

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({
    baseDomain: 'example.com',
    mcDomain: 'mc.example.com',
    loading: true,
  });

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig({
          baseDomain: data.baseDomain,
          mcDomain: data.mcDomain,
          loading: false,
        });
      })
      .catch(err => {
        console.error('Errore caricamento configurazione:', err);
        setConfig(prev => ({ ...prev, loading: false }));
      });
  }, []);

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}

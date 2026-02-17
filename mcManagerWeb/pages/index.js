import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../components/Sidebar';
import ServerDetail from '../components/ServerDetail';
import CreateServerModal from '../components/CreateServerModal';

let socket;

export default function Home() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [lastReload, setLastReload] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Aggiorna timestamp hot reload
    setLastReload(new Date());
    setMounted(true);

    // Connetti Socket.IO
    socketInitializer();
    // Carica server
    loadServers();

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  // Sincronizza selectedServer con i dati aggiornati da servers
  useEffect(() => {
    if (selectedServer) {
      const updatedServer = servers.find(s => s.id === selectedServer.id);
      if (updatedServer && JSON.stringify(updatedServer) !== JSON.stringify(selectedServer)) {
        setSelectedServer(updatedServer);
      }
    }
  }, [servers]);

  async function socketInitializer() {
    try {
      await fetch('/api/socket');
    } catch (error) {
      console.error('Errore inizializzazione Socket.IO:', error);
    }

    socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('Socket.IO connesso');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket.IO errore connessione:', error);
    });

    socket.on('status', (data) => {
      console.log(`[Socket.IO] Ricevuto status update: serverId=${data.serverId}, status=${data.status}`);
      setServers(prev => prev.map(s =>
        s.id === data.serverId ? { ...s, status: data.status } : s
      ));
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnesso');
    });
  }

  const loadServers = async () => {
    try {
      const response = await fetch('/api/servers');
      const data = await response.json();

      // Assicurati che data sia un array
      if (Array.isArray(data)) {
        setServers(data);
      } else {
        console.error('API returned non-array data:', data);
        setServers([]);
      }
    } catch (error) {
      console.error('Errore caricamento server:', error);
      setServers([]);
    }
  };

  const createServer = async (serverData) => {
    try {
      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverData),
      });

      if (response.ok) {
        loadServers();
        setShowCreateModal(false);
      } else {
        alert('Errore nella creazione del server');
      }
    } catch (error) {
      console.error('Errore creazione server:', error);
      alert('Errore nella creazione del server');
    }
  };

  const deleteServer = async (serverId) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo server?')) {
      return;
    }

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadServers();
        if (selectedServer?.id === serverId) {
          setSelectedServer(null);
        }
      } else {
        alert('Errore nell\'eliminazione del server');
      }
    } catch (error) {
      console.error('Errore eliminazione server:', error);
      alert('Errore nell\'eliminazione del server');
    }
  };

  return (
    <div className="App">
      {/* Timestamp hot reload overlay - solo client-side per evitare hydration error */}
      {mounted && (
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          fontSize: '11px',
          color: '#888',
          zIndex: 9999,
          fontFamily: 'monospace',
          userSelect: 'none',
          pointerEvents: 'none'
        }}>
          {lastReload.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </div>
      )}

      <Sidebar
        servers={servers}
        selectedServer={selectedServer}
        onSelectServer={setSelectedServer}
        onDeleteServer={deleteServer}
        onRefresh={loadServers}
        onNewServer={() => setShowCreateModal(true)}
      />

      {selectedServer ? (
        <ServerDetail
          server={selectedServer}
          onUpdate={loadServers}
          onDelete={deleteServer}
          socket={socket}
        />
      ) : (
        <div className="app-content">
          <div className="no-selection">
            <span style={{fontSize: '3rem', marginBottom: '1rem'}}>📦</span>
            <p>Seleziona un server dalla sidebar</p>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createServer}
        />
      )}
    </div>
  );
}

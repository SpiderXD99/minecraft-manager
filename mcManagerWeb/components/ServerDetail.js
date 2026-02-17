import { useState, useEffect, useRef, useCallback } from 'react';
import FileManager from './FileManager';
import ModsManager from './ModsManager';
import { useConfig } from '../lib/config-context';
import { getServerSubdomain, normalizeSubdomain } from '../lib/utils';
import { useCopyToClipboard } from '../lib/hooks/useCopyToClipboard';
import { COMMON_COMMANDS, LOG_POLL_INTERVAL, SERVICE_SUBDOMAIN_PREFIXES, SERVICE_PROTOCOLS } from '../lib/constants';
import {
  Play, Square, Zap, Trash2, Edit3, Check, X, Copy, ExternalLink, Plus, Globe, Wifi,
  ArrowDownToLine, Pause, RotateCw
} from 'lucide-react';

export default function ServerDetail({ server, onUpdate, onDelete, socket }) {
  const { mcDomain, baseDomain } = useConfig();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState([]);
  const [command, setCommand] = useState('');
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedServer, setEditedServer] = useState({});
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);

  const loadHistoricalLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs.map(message => ({ message })));
      }
    } catch (error) {
      console.error('Errore caricamento log storici:', error);
    }
  }, [server.id]);

  useEffect(() => {
    setLogs([]);
    setActiveTab('overview');
    setAutoScroll(true); // Reset auto-scroll when server changes
    // Carica log storici sempre (anche se il server è offline)
    loadHistoricalLogs();
  }, [server.id, loadHistoricalLogs]);

  useEffect(() => {
    if (!socket) return;

    const handleLog = (data) => {
      if (data.serverId === server.id) {
        setLogs(prev => [...prev, { message: data.message }]);
      }
    };

    socket.on('log', handleLog);
    return () => socket.off('log', handleLog);
  }, [socket, server.id]);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Scroll to bottom when switching to console tab
  useEffect(() => {
    if (activeTab === 'console' && autoScroll) {
      // Small delay to ensure the DOM is rendered
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [activeTab, autoScroll]);

  // Polling dei log quando il server è stopped (aggiorna ogni 2 secondi)
  useEffect(() => {
    let interval;
    if (server.status === 'stopped' || server.status === 'killing') {
      // Carica immediatamente i log quando il server si ferma
      loadHistoricalLogs();

      // Poi aggiorna ogni LOG_POLL_INTERVAL per vedere log aggiuntivi
      interval = setInterval(() => {
        loadHistoricalLogs();
      }, LOG_POLL_INTERVAL);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [server.status, loadHistoricalLogs]);

  // Carica log storici quando si passa al tab console
  useEffect(() => {
    if (activeTab === 'console') {
      // Carica log storici se i log sono vuoti
      if (logs.length === 0) {
        loadHistoricalLogs();
      }
      const timer = setTimeout(() => {
        onUpdate();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  useEffect(() => {
    if (command.trim()) {
      const filtered = COMMON_COMMANDS.filter(cmd =>
        cmd.toLowerCase().startsWith(command.toLowerCase())
      );
      setFilteredCommands(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [command]);

  const startServer = async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/start`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Errore avvio server');
        return;
      }
      setActiveTab('console');
      // Aspetta un po' prima di aggiornare per dare tempo al socket di connettersi
      setTimeout(() => {
        onUpdate();
      }, 500);
    } catch (error) {
      alert('Errore avvio server');
    }
  };

  const stopServer = async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/stop`, { method: 'POST' });
      if (res.ok) {
        console.log('Comando stop inviato, server in stato killing...');
        // Aggiorna lo stato immediatamente a "killing"
        onUpdate();

        // Polling per verificare quando il server si è effettivamente fermato
        const checkInterval = setInterval(async () => {
          await onUpdate();
          // Verifica se il server è tornato allo stato stopped
          const serversList = await fetch('/api/servers').then(r => r.json());
          const currentServer = serversList.find(s => s.id === server.id);
          if (currentServer && currentServer.status === 'stopped') {
            console.log('Server fermato con successo');
            clearInterval(checkInterval);
          }
        }, 2000);

        // Timeout di sicurezza per fermare il polling dopo 30 secondi
        setTimeout(() => clearInterval(checkInterval), 30000);
      }
    } catch (error) {
      console.error('Errore stop server:', error);
      alert('Errore stop server');
    }
  };

  const killServer = async () => {
    if (!window.confirm(`Sei sicuro di voler killare forzatamente il server "${server.name}"? Questo terminerà immediatamente tutti i processi senza salvare.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/servers/${server.id}/kill`, { method: 'POST' });
      if (res.ok) {
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error || 'Errore kill server');
      }
    } catch (error) {
      alert('Errore kill server');
    }
  };

  const restartServer = async () => {
    try {
      const res = await fetch(`/api/servers/${server.id}/restart`, { method: 'POST' });
      if (res.ok) {
        setActiveTab('console');
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error || 'Errore restart server');
      }
    } catch (error) {
      alert('Errore restart server');
    }
  };

  const deleteServer = async () => {
    if (!window.confirm(`Sei sicuro di voler eliminare il server "${server.name}"?`)) {
      return;
    }
    if (onDelete) {
      await onDelete(server.id);
    }
  };

  const sendCommand = async (e) => {
    e.preventDefault();
    if (!command.trim()) return;

    try {
      await fetch(`/api/servers/${server.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      });
      setCommand('');
      setShowSuggestions(false);
    } catch (error) {
      alert('Errore invio comando');
    }
  };

  const selectSuggestion = (cmd) => {
    setCommand(cmd);
    setShowSuggestions(false);
  };

  const startEditing = () => {
    // Convert additionalPorts to additionalServices array for editing
    const additionalServices = [];
    if (server.additionalPorts) {
      Object.entries(server.additionalPorts).forEach(([serviceName, portConfig]) => {
        if (typeof portConfig === 'number') {
          const serviceNameUpper = serviceName.toUpperCase();
          additionalServices.push({
            subdomain: SERVICE_SUBDOMAIN_PREFIXES[serviceNameUpper] || '',
            port: portConfig,
            description: serviceName,
            enabled: true
          });
        } else if (typeof portConfig === 'object') {
          additionalServices.push({
            subdomain: portConfig.subdomain || '',
            port: portConfig.port,
            description: portConfig.description || serviceName,
            enabled: true,
            enableSsl: portConfig.enableSsl || false
          });
        }
      });
    }

    setEditedServer({
      name: server.name,
      subdomain: server.subdomain || '',
      minecraftVersion: server.minecraftVersion || 'latest',
      maxRam: server.maxRam,
      minRam: server.minRam,
      additionalServices
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedServer({});
  };

  // Service management functions
  const serviceTemplates = [
    { subdomain: 'dynmap', port: 8123, description: 'Dynmap web map', enableSsl: true },
    { subdomain: 'bluemap', port: 8100, description: 'BlueMap 3D map', enableSsl: true },
    { subdomain: 'map', port: 8080, description: 'SquareMap', enableSsl: true },
    { subdomain: 'plan', port: 8804, description: 'Plan analytics', enableSsl: true },
    { subdomain: '', port: 24454, description: 'Voice Chat (UDP)', enableSsl: false },
    { subdomain: '', port: 19132, description: 'Geyser (Bedrock)', enableSsl: false },
  ];

  const addService = () => {
    setEditedServer({
      ...editedServer,
      additionalServices: [
        ...(editedServer.additionalServices || []),
        { subdomain: '', port: '', description: '', enabled: true, enableSsl: false }
      ]
    });
  };

  const addFromTemplate = (template) => {
    setEditedServer({
      ...editedServer,
      additionalServices: [
        ...(editedServer.additionalServices || []),
        { ...template, enabled: true }
      ]
    });
  };

  const removeService = (index) => {
    const newServices = (editedServer.additionalServices || []).filter((_, i) => i !== index);
    setEditedServer({
      ...editedServer,
      additionalServices: newServices
    });
  };

  const updateService = (index, field, value) => {
    const newServices = [...(editedServer.additionalServices || [])];
    newServices[index] = { ...newServices[index], [field]: value };
    setEditedServer({
      ...editedServer,
      additionalServices: newServices
    });
  };

  const saveChanges = async () => {
    try {
      // Convert additionalServices array to additionalPorts object
      const additionalPorts = {};
      (editedServer.additionalServices || []).forEach((service, index) => {
        if (service.enabled && service.port) {
          const serviceKey = service.subdomain || `service${index}`;
          additionalPorts[serviceKey] = {
            port: parseInt(service.port),
            subdomain: service.subdomain || null,
            description: service.description || '',
            enableSsl: service.enableSsl || false
          };
        }
      });

      const updateData = {
        name: editedServer.name,
        subdomain: editedServer.subdomain,
        minecraftVersion: editedServer.minecraftVersion,
        maxRam: editedServer.maxRam,
        minRam: editedServer.minRam,
        additionalPorts
      };

      const res = await fetch(`/api/servers/${server.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (res.ok) {
        setIsEditing(false);
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error || 'Errore aggiornamento server');
      }
    } catch (error) {
      alert('Errore aggiornamento server');
    }
  };

  return (
    <div className="app-content">
      {/* Compact Header with Name, ID, Status, and Actions */}
      <div className="server-compact-header">
        <div className="server-title-row">
          <h2>{server.name}</h2>
          <span className="server-id-badge">{server.id}</span>
          <div className={`status-indicator status-indicator-large ${server.status}`} />
        </div>
        <div className="server-actions-compact">
          {server.status === 'running' ? (
            <>
              <button onClick={stopServer} className="btn btn-danger btn-sm">
                <Square size={14} /> Stop
              </button>
              <button onClick={restartServer} className="btn btn-primary btn-sm" title="Riavvia server">
                <RotateCw size={14} /> Restart
              </button>
            </>
          ) : server.status === 'killing' ? (
            <button className="btn btn-danger btn-sm" disabled>
              <Square size={14} /> Stopping...
            </button>
          ) : server.status === 'deleting' ? (
            <button className="btn btn-danger btn-sm" disabled>
              <Trash2 size={14} /> Deleting...
            </button>
          ) : (
            <button onClick={startServer} className="btn btn-success btn-sm">
              <Play size={14} /> Start
            </button>
          )}
          <button
            onClick={killServer}
            className="btn btn-warning btn-sm"
            title="Termina forzatamente tutti i processi (SIGKILL)"
            disabled={server.status === 'deleting'}
          >
            <Zap size={14} /> Kill
          </button>
          <button
            onClick={deleteServer}
            className="btn btn-danger-outline btn-sm"
            title="Elimina server"
            disabled={server.status === 'deleting' || server.status === 'killing'}
          >
            <Trash2 size={14} /> Elimina
          </button>
        </div>
      </div>

      {/* Compact Tabs */}
      <div className="content-tabs compact">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'console' ? 'active' : ''}`}
          onClick={() => setActiveTab('console')}
        >
          Console
        </button>
        <button
          className={`tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          className={`tab ${activeTab === 'mods' ? 'active' : ''}`}
          onClick={() => setActiveTab('mods')}
        >
          Mods
        </button>
      </div>

      {/* Tab Content */}
      <div className="content-body">
        {activeTab === 'overview' && (
          <div className="server-details">
            <div className="detail-section">
              <div className="detail-section-header">
                <h3>Configurazione Server</h3>
                {!isEditing ? (
                  <button onClick={startEditing} className="btn btn-primary btn-sm">
                    <Edit3 size={16} /> Modifica
                  </button>
                ) : (
                  <div className="detail-actions-group">
                    <button onClick={saveChanges} className="btn btn-success btn-sm">
                      <Check size={16} /> Salva
                    </button>
                    <button onClick={cancelEditing} className="btn btn-secondary btn-sm">
                      <X size={16} /> Annulla
                    </button>
                  </div>
                )}
              </div>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Nome Server</label>
                  {isEditing ? (
                    <input
                      type="text"
                      className="value-input"
                      value={editedServer.name}
                      onChange={(e) => setEditedServer({...editedServer, name: e.target.value})}
                    />
                  ) : (
                    <div className="value">{server.name}</div>
                  )}
                </div>
                <div className="detail-item">
                  <label>Sottodominio</label>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        className="value-input"
                        value={editedServer.subdomain}
                        onChange={(e) => setEditedServer({...editedServer, subdomain: normalizeSubdomain(e.target.value)})}
                        placeholder="es: survival, creative"
                        required
                      />
                      <small className="subdomain-hint">
                        {getServerSubdomain(editedServer.subdomain ? editedServer : server)}.{mcDomain}
                      </small>
                    </div>
                  ) : (
                    <div className="value subdomain-value-container">
                      <span className="subdomain-value-text">
                        {getServerSubdomain(server)}.{mcDomain}
                      </span>
                      <button
                        className="btn-copy-small"
                        onClick={() => {
                          const domain = `${getServerSubdomain(server)}.${mcDomain}`;
                          copyToClipboard(domain);
                        }}
                        title="Copia dominio"
                      >
                        {isCopied() ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="detail-item">
                  <label>Status</label>
                  <div className="value">{server.status === 'running' ? 'Online' : 'Offline'}</div>
                </div>
                <div className="detail-item">
                  <label>Server Type</label>
                  <div className="value">{server.serverType || 'paper'}</div>
                </div>
                <div className="detail-item">
                  <label>Minecraft Version</label>
                  {isEditing ? (
                    <input
                      type="text"
                      className="value-input"
                      value={editedServer.minecraftVersion}
                      onChange={(e) => setEditedServer({...editedServer, minecraftVersion: e.target.value})}
                      placeholder="latest, 1.20.4, etc."
                    />
                  ) : (
                    <div className="value">{server.minecraftVersion || 'latest'}</div>
                  )}
                </div>
                <div className="detail-item">
                  <label>RAM Min (MB)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      className="value-input"
                      value={editedServer.minRam}
                      onChange={(e) => setEditedServer({...editedServer, minRam: parseInt(e.target.value)})}
                      min="512"
                      step="256"
                    />
                  ) : (
                    <div className="value">{server.minRam} MB</div>
                  )}
                </div>
                <div className="detail-item">
                  <label>RAM Max (MB)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      className="value-input"
                      value={editedServer.maxRam}
                      onChange={(e) => setEditedServer({...editedServer, maxRam: parseInt(e.target.value)})}
                      min="1024"
                      step="256"
                    />
                  ) : (
                    <div className="value">{server.maxRam} MB</div>
                  )}
                </div>
                <div className="detail-item">
                  <label>Java Version</label>
                  <div className="value">{server.javaVersion}</div>
                </div>
                <div className="detail-item">
                  <label>Server ID</label>
                  <div className="value server-id-value">{server.id}</div>
                </div>

                {/* Servizi Aggiuntivi - Edit Mode */}
                {isEditing && (
                  <div className="detail-item detail-item-full-width">
                    <label>Servizi Aggiuntivi (opzionali)</label>

                    {editedServer.additionalServices && editedServer.additionalServices.length > 0 && (
                      <div className="services-editor-container">
                        {editedServer.additionalServices.map((service, index) => (
                          <div key={index} className="service-editor-grid">
                            <input
                              type="checkbox"
                              checked={service.enabled}
                              onChange={(e) => updateService(index, 'enabled', e.target.checked)}
                              className="service-checkbox"
                            />
                            <input
                              type="text"
                              value={service.subdomain}
                              onChange={(e) => updateService(index, 'subdomain', e.target.value)}
                              placeholder="subdomain (opzionale)"
                              className="service-input"
                              disabled={!service.enabled}
                            />
                            <input
                              type="number"
                              value={service.port}
                              onChange={(e) => updateService(index, 'port', e.target.value)}
                              placeholder="Porta"
                              className="service-port-input"
                              disabled={!service.enabled}
                            />
                            <input
                              type="text"
                              value={service.description}
                              onChange={(e) => updateService(index, 'description', e.target.value)}
                              placeholder="Descrizione"
                              className="service-input"
                              disabled={!service.enabled}
                            />
                            <div className="service-ssl-container">
                              <input
                                type="checkbox"
                                checked={service.enableSsl || false}
                                onChange={(e) => updateService(index, 'enableSsl', e.target.checked)}
                                disabled={!service.enabled || !service.subdomain}
                                className="service-checkbox"
                                title="Abilita SSL/HTTPS"
                              />
                              <span className="service-ssl-label">SSL</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeService(index)}
                              className="service-delete-btn"
                            >
                              <Trash2 size={14} />
                            </button>
                            {service.enabled && baseDomain && (
                              <div className="service-url-preview">
                                {service.subdomain ? (
                                  <>
                                    <Globe size={12} />
                                    {service.enableSsl
                                      ? `https://${service.subdomain}-${editedServer.subdomain || getServerSubdomain(server)}.${baseDomain}`
                                      : `http://${service.subdomain}-${editedServer.subdomain || getServerSubdomain(server)}.${baseDomain}`
                                    }
                                  </>
                                ) : (
                                  <>
                                    <Wifi size={12} />
                                    {`${baseDomain}:${service.port}`}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="service-actions-container">
                      <button
                        type="button"
                        onClick={addService}
                        className="btn btn-secondary btn-sm service-add-btn"
                      >
                        <Plus size={16} />
                        Aggiungi Servizio
                      </button>

                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const template = serviceTemplates[parseInt(e.target.value)];
                            addFromTemplate(template);
                            e.target.value = '';
                          }
                        }}
                        className="service-template-dropdown"
                      >
                        <option value="">Quick Add...</option>
                        {serviceTemplates.map((template, i) => (
                          <option key={i} value={i}>
                            {template.description} ({template.subdomain || 'UDP'} : {template.port})
                          </option>
                        ))}
                      </select>
                    </div>

                    <small className="service-help-text">
                      • <strong>Subdomain</strong>: lascia vuoto per porte UDP (Voice Chat, Geyser)<br />
                      • <strong>Porta</strong>: porta interna del container<br />
                      • Dovrai installare manualmente i plugin/mod richiesti
                    </small>
                  </div>
                )}

                {/* Servizi Aggiuntivi - View Mode */}
                {!isEditing && server.additionalPorts && Object.keys(server.additionalPorts).length > 0 && (
                  <div className="detail-item detail-item-full-width">
                    <label>Servizi Aggiuntivi</label>
                    <div className="services-view-container">
                      {Object.entries(server.additionalPorts).map(([serviceName, portConfig]) => {
                        // Supporta sia formato vecchio (number) che nuovo (object)
                        let port, subdomainPrefix, description, enableSsl;

                        if (typeof portConfig === 'number') {
                          port = portConfig;
                          const serviceNameUpper = serviceName.toUpperCase();
                          subdomainPrefix = SERVICE_SUBDOMAIN_PREFIXES[serviceNameUpper];
                        } else if (typeof portConfig === 'object') {
                          port = portConfig.port;
                          subdomainPrefix = portConfig.subdomain;
                          description = portConfig.description;
                          enableSsl = portConfig.enableSsl;
                        }

                        const isHttp = !!subdomainPrefix;
                        const protocol = enableSsl ? 'https' : 'http';
                        const serviceUrl = isHttp && baseDomain
                          ? `${protocol}://${subdomainPrefix}-${getServerSubdomain(server)}.${baseDomain}`
                          : `${baseDomain}:${port}`;

                        const displayName = description || serviceName.replace(/([A-Z])/g, ' $1').trim();

                        return (
                          <div key={serviceName} className="service-view-item">
                            <span className="service-view-icon">
                              {isHttp ? <Globe size={14} className="icon-success" /> : <Wifi size={14} className="icon-primary" />}
                            </span>
                            <span className="service-view-name">
                              {displayName}
                            </span>
                            <span className="service-view-port">
                              :{port}
                            </span>
                            <span className="service-view-separator">→</span>
                            <a
                              href={isHttp ? serviceUrl : undefined}
                              target={isHttp ? "_blank" : undefined}
                              rel={isHttp ? "noopener noreferrer" : undefined}
                              className="service-view-link"
                            >
                              {serviceUrl}
                              {isHttp && <ExternalLink size={12} />}
                            </a>
                            <button
                              className="btn-copy-small service-view-copy-btn"
                              onClick={() => copyToClipboard(serviceUrl, serviceName)}
                              title="Copia URL"
                            >
                              {isCopied(serviceName) ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'console' && (
          <div className="console-section">
            <div className="console-header">
              <h3>Log Server</h3>
              <button
                className={`btn btn-sm ${autoScroll ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? 'Auto-scroll attivo (clicca per disattivare)' : 'Auto-scroll disattivato (clicca per attivare)'}
              >
                {autoScroll ? <ArrowDownToLine size={14} /> : <Pause size={14} />}
                {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              </button>
            </div>
            <div className="console-wrapper">
              <div className="console-logs">
                {logs.length === 0 ? (
                  <div className="console-empty">
                    {server.status === 'running'
                      ? 'In attesa di log dal server...'
                      : 'Nessun log disponibile. Avvia il server per vedere i log.'}
                  </div>
                ) : (
                  logs.map((log, i) => {
                    let logType = 'info';
                    const msg = log.message.toLowerCase();
                    if (msg.includes('warn')) logType = 'warn';
                    else if (msg.includes('error') || msg.includes('exception') || msg.includes('failed')) logType = 'error';

                    return (
                      <div key={i} className="log-entry">
                        <span className={`log-message log-${logType}`}>{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>

              {server.status === 'running' && (
                <div className="command-input-section">
                  <form onSubmit={sendCommand} className="command-input-wrapper">
                    {showSuggestions && filteredCommands.length > 0 && (
                      <div className="suggestions">
                        {filteredCommands.map(cmd => (
                          <div
                            key={cmd}
                            className="suggestion-item"
                            onClick={() => selectSuggestion(cmd)}
                          >
                            {cmd}
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="Digita un comando..."
                      className="command-input"
                      autoComplete="off"
                    />
                    <button type="submit" className="btn btn-primary">Invia</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <FileManager serverId={server.id} />
        )}

        {activeTab === 'mods' && (
          <ModsManager
            serverId={server.id}
            serverType={server.serverType || 'paper'}
            minecraftVersion={server.minecraftVersion}
          />
        )}
      </div>
    </div>
  );
}

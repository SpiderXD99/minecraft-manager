import { RefreshCw, Plus, Copy, Check } from 'lucide-react';
import { useConfig } from '../lib/config-context';
import { getServerSubdomain } from '../lib/utils';
import { useCopyToClipboard } from '../lib/hooks/useCopyToClipboard';

function Sidebar({
  servers,
  selectedServer,
  onSelectServer,
  onRefresh,
  onNewServer
}) {
  const { mcDomain } = useConfig();
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Minecraft Manager</h1>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-actions">
          <button className="btn btn-icon btn-secondary" onClick={onRefresh} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <button className="btn btn-primary sidebar-btn-flex" onClick={onNewServer}>
            <Plus size={18} /> Nuovo
          </button>
        </div>

        <div className="server-list">
          {!Array.isArray(servers) || servers.length === 0 ? (
            <div className="empty-state">
              <p>Nessun server</p>
              <p className="empty-state-hint">Clicca "+ Nuovo" per iniziare</p>
            </div>
          ) : (
            <div className="servers">
              {servers.map(server => (
                <div
                  key={server.id}
                  className={`server-card-compact ${selectedServer?.id === server.id ? 'selected' : ''}`}
                  onClick={() => onSelectServer(server)}
                >
                  <div className="server-compact-line">
                    <span className="server-name">{server.name}</span>
                  </div>
                  <div className="server-compact-meta">
                    <span className="server-subdomain" title="Dominio completo">
                      {getServerSubdomain(server)}.{mcDomain}
                    </span>
                    <button
                      className="btn-copy-subdomain"
                      onClick={(e) => {
                        e.stopPropagation();
                        const domain = `${getServerSubdomain(server)}.${mcDomain}`;
                        copyToClipboard(domain, server.id);
                      }}
                      title="Copia dominio"
                    >
                      {isCopied(server.id) ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <div className={`status-dot ${server.status}`} />
                  </div>
                  <div className="server-compact-meta">
                    <span className="server-type">{server.serverType || 'paper'} {server.minecraftVersion || 'latest'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;

import { useState, useEffect } from 'react';
import { RefreshCw, HardDrive, Cpu, MemoryStick, Server, Activity } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MiniBar({ percent, color }) {
  const c = percent > 85 ? '#f44336' : percent > 60 ? '#ff9800' : color;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, percent)}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, opacity: 0.7, width: 32, textAlign: 'right' }}>{percent}%</span>
    </div>
  );
}

function StatCard({ icon, label, children }) {
  return (
    <div className="sysstat-card">
      <div className="sysstat-card-title">{icon}{label}</div>
      {children}
    </div>
  );
}

export default function SystemStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/system/stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const ramPercent      = stats ? Math.round((stats.ram.used      / stats.ram.total) * 100) : 0;
  const ramBuffPercent  = stats ? Math.round((stats.ram.buffCache / stats.ram.total) * 100) : 0;
  const diskPercent = stats ? Math.round((stats.disk.used / stats.disk.total) * 100) : 0;

  return (
    <div className="app-content">
      <div className="server-compact-header">
        <div className="server-title-row">
          <Activity size={20} />
          <h2 style={{ marginLeft: 8 }}>Stato Sistema</h2>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Aggiorna
        </button>
      </div>

      {loading && !stats ? (
        <div style={{ padding: 32, opacity: 0.5 }}>Caricamento...</div>
      ) : !stats ? (
        <div style={{ padding: 32, opacity: 0.5 }}>Dati non disponibili</div>
      ) : (
        <>
          {/* Schede sistema */}
          <div className="sysstat-cards-row">
            <StatCard icon={<Cpu size={14} />} label={`CPU — ${stats.cpu.cores} core`}>
              <div className="sysstat-big">{stats.cpu.percent}%</div>
              <MiniBar percent={stats.cpu.percent} color="#2196f3" />
            </StatCard>

            <StatCard icon={<MemoryStick size={14} />} label={`RAM — ${formatBytes(stats.ram.total)}`}>
              <div className="sysstat-big">{formatBytes(stats.ram.used)}</div>
              {/* Barra segmentata a colori: used | buff/cache | free */}
              <div style={{ display:'flex', height:6, borderRadius:3, overflow:'hidden', marginBottom:6 }}>
                <div style={{ width:`${ramPercent}%`, background: ramPercent > 85 ? '#f44336' : '#ff9800', transition:'width 0.4s' }} />
                <div style={{ width:`${ramBuffPercent}%`, background:'#9c27b0', transition:'width 0.4s' }} />
                <div style={{ flex:1, background:'rgba(255,255,255,0.07)' }} />
              </div>
              {/* Legenda su riga singola */}
              <div style={{ display:'flex', gap:10, fontSize:11, flexWrap:'wrap' }}>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:7, height:7, borderRadius:1, background:'#ff9800', display:'inline-block', flexShrink:0 }} />
                  <span style={{ opacity:0.6 }}>Usata</span> {formatBytes(stats.ram.used)}
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:7, height:7, borderRadius:1, background:'#9c27b0', display:'inline-block', flexShrink:0 }} />
                  <span style={{ opacity:0.6 }}>Cache</span> {formatBytes(stats.ram.buffCache)}
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:7, height:7, borderRadius:1, background:'rgba(255,255,255,0.07)', border:'1px solid #334', display:'inline-block', flexShrink:0 }} />
                  <span style={{ opacity:0.6 }}>Libera</span> {formatBytes(stats.ram.free)}
                </span>
              </div>
            </StatCard>

            <StatCard icon={<HardDrive size={14} />} label="Disco">
              <div className="sysstat-big">{formatBytes(stats.disk.used)}</div>
              <MiniBar percent={diskPercent} color="#ff9800" />
              <div className="sysstat-sub">{formatBytes(stats.disk.avail)} libero · totale {formatBytes(stats.disk.total)}</div>
              <div className="sysstat-sub">Server data: {formatBytes(stats.disk.serversSize)}</div>
            </StatCard>

            <StatCard icon={<Server size={14} />} label="Server">
              <div className="sysstat-big" style={{ color: '#4caf50' }}>
                {stats.servers.filter(s => s.status === 'running').length}
                <span style={{ fontSize: 14, color: 'inherit', opacity: 0.5 }}>/{stats.servers.length}</span>
              </div>
              <div className="sysstat-sub">online · uptime {formatUptime(stats.uptime)}</div>
            </StatCard>
          </div>

          {/* Tabella server */}
          <div className="detail-section" style={{ marginTop: 16 }}>
            <div className="detail-section-header">
              <h3>Server</h3>
            </div>
            <table className="sysstat-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Stato</th>
                  <th>Disco</th>
                  <th>RAM usata</th>
                  <th style={{ minWidth: 140 }}>RAM %</th>
                  <th>CPU %</th>
                </tr>
              </thead>
              <tbody>
                {stats.servers.map(s => {
                  const ramPct = s.ramLimit > 0 ? Math.round((s.ram / s.ramLimit) * 100) : 0;
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td>
                        <span className={`status-badge ${s.status}`}>
                          {s.status === 'running' ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{formatBytes(s.disk)}</td>
                      <td>
                        {s.status === 'running'
                          ? `${formatBytes(s.ram)} / ${formatBytes(s.ramLimit)}`
                          : <span style={{ opacity: 0.4 }}>—</span>
                        }
                      </td>
                      <td>
                        {s.status === 'running'
                          ? <MiniBar percent={ramPct} color="#9c27b0" />
                          : <span style={{ opacity: 0.4 }}>—</span>
                        }
                      </td>
                      <td>
                        {s.status === 'running'
                          ? `${s.cpu.toFixed(1)}%`
                          : <span style={{ opacity: 0.4 }}>—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

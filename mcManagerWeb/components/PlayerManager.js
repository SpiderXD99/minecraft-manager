import { useState, useEffect } from 'react';
import {
  RefreshCw, Search, Users, Heart, Utensils, MapPin, Star,
  Shield, ShieldOff, UserX, Ban, UserPlus, UserMinus,
  Swords, Skull, Clock, Footprints, Package, ChevronDown, ChevronUp, X
} from 'lucide-react';

export default function PlayerManager({ serverId }) {
  const [players, setPlayers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    stats: true, inventory: true, enderChest: false, advancements: false
  });

  useEffect(() => {
    loadPlayers();
  }, [serverId]);

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/players`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players || []);
        setOnlineCount(data.onlineCount || 0);
        setMaxPlayers(data.maxPlayers || 20);
      }
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerDetail = async (uuid) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/players/${uuid}`);
      if (res.ok) {
        const data = await res.json();
        setPlayerDetail(data);
      }
    } catch (error) {
      console.error('Error loading player detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const selectPlayer = (player) => {
    setSelectedPlayer(player);
    loadPlayerDetail(player.uuid);
  };

  const executeAction = async (action, playerName, extra = {}) => {
    if (action === 'ban' && !confirm(`Sei sicuro di voler bannare ${playerName}?`)) return;
    if (action === 'kick' && !confirm(`Kickare ${playerName}?`)) return;

    setActionLoading(prev => ({ ...prev, [action]: true }));
    try {
      const res = await fetch(`/api/servers/${serverId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, playerName, ...extra })
      });
      if (res.ok) {
        setTimeout(loadPlayers, 1000);
      } else {
        const err = await res.json();
        alert(err.error || 'Errore');
      }
    } catch (error) {
      alert('Errore: ' + error.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [action]: false }));
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatItemName = (id) => {
    return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Parse namespace and name from a raw item ID like "minecraft:stone" or "pointblank:vector"
  const parseItemId = (item) => {
    if (!item?.rawId) return null;
    const parts = item.rawId.split(':');
    if (parts.length === 2) return { namespace: parts[0], name: parts[1] };
    return { namespace: 'minecraft', name: parts[0] };
  };

  const MC_ASSETS_BASE = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20/assets/minecraft/textures';

  // Convert snake_case to Title_Case for Minecraft Wiki Invicon URLs
  const toWikiName = (name) => name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');

  const getItemImageUrl = (item) => {
    const parsed = parseItemId(item);
    if (!parsed) return null;
    if (parsed.namespace === 'minecraft') {
      return `${MC_ASSETS_BASE}/item/${parsed.name}.png`;
    }
    // Modded item: use server-side JAR extraction
    return `/api/servers/${serverId}/texture?ns=${parsed.namespace}&type=item&name=${parsed.name}`;
  };

  // Wiki inventory icon fallback: exact isometric renders used in-game
  const getWikiIconUrl = (item) => {
    const parsed = parseItemId(item);
    if (!parsed || parsed.namespace !== 'minecraft') return null;
    return `https://minecraft.wiki/images/Invicon_${toWikiName(parsed.name)}.png`;
  };

  const getBlockImageUrl = (item) => {
    const parsed = parseItemId(item);
    if (!parsed) return null;
    if (parsed.namespace === 'minecraft') return null; // avoid flat block faces for vanilla
    return `/api/servers/${serverId}/texture?ns=${parsed.namespace}&type=block&name=${parsed.name}`;
  };

  // Build inventory grid (36 main slots + armor + offhand)
  const buildInventoryGrid = (inventory) => {
    const slots = new Array(36).fill(null);
    const armor = new Array(4).fill(null); // 100=feet,101=legs,102=chest,103=head
    let offhand = null;

    for (const item of inventory) {
      if (item.slot >= 0 && item.slot < 36) {
        slots[item.slot] = item;
      } else if (item.slot >= 100 && item.slot <= 103) {
        armor[item.slot - 100] = item;
      } else if (item.slot === -106) {
        offhand = item;
      }
    }

    return { slots, armor: armor.reverse(), offhand }; // reverse armor: head first
  };

  const buildEnderGrid = (enderItems) => {
    const slots = new Array(27).fill(null);
    for (const item of enderItems) {
      if (item.slot >= 0 && item.slot < 27) {
        slots[item.slot] = item;
      }
    }
    return slots;
  };

  const filteredPlayers = players.filter(p => {
    if (showOnlineOnly && !p.online) return false;
    if (searchQuery) {
      return p.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const renderSlot = (item, index) => {
    const parsed = parseItemId(item);
    const isModded = parsed && parsed.namespace !== 'minecraft';
    const imgUrl = getItemImageUrl(item);
    const wikiUrl = getWikiIconUrl(item);   // isometric icon for vanilla blocks
    const blockUrl = getBlockImageUrl(item); // block texture for modded only

    // Fallback chain: imgUrl → wikiUrl → blockUrl → text
    const fallbacks = [wikiUrl, blockUrl].filter(Boolean);

    return (
      <div key={index} className={`pm-slot ${item ? 'pm-slot-filled' : ''}`} title={item ? `${formatItemName(item.id)} x${item.count}` : 'Vuoto'}>
        {item && (
          <>
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={item.id}
                className="pm-slot-img"
                loading="lazy"
                data-fallbacks={JSON.stringify(fallbacks)}
                onError={(e) => {
                  const remaining = JSON.parse(e.target.dataset.fallbacks || '[]');
                  const next = remaining.shift();
                  if (next) {
                    e.target.dataset.fallbacks = JSON.stringify(remaining);
                    e.target.src = next;
                  } else {
                    e.target.style.display = 'none';
                    e.target.parentElement.querySelector('.pm-slot-name').style.display = 'block';
                  }
                }}
              />
            ) : null}
            <span className="pm-slot-name" style={imgUrl ? { display: 'none' } : undefined}>
              {item.id}
            </span>
            {item.count > 1 && <span className="pm-slot-count">{item.count}</span>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="player-manager">
      {/* Toolbar */}
      <div className="pm-toolbar">
        <div className="pm-online-badge">
          <Users size={14} />
          <span>{onlineCount}/{maxPlayers} online</span>
        </div>
        <div className="pm-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Cerca giocatore..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="pm-search-clear" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <label className="pm-filter-toggle">
          <input
            type="checkbox"
            checked={showOnlineOnly}
            onChange={(e) => setShowOnlineOnly(e.target.checked)}
          />
          Solo online
        </label>
        <button className="btn btn-sm btn-secondary" onClick={loadPlayers} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Aggiorna
        </button>
      </div>

      <div className="pm-container">
        {/* Player List */}
        <div className="pm-player-list">
          {loading && players.length === 0 ? (
            <div className="pm-empty">Caricamento...</div>
          ) : filteredPlayers.length === 0 ? (
            <div className="pm-empty">
              {players.length === 0
                ? 'Nessun giocatore ha ancora giocato'
                : 'Nessun risultato'}
            </div>
          ) : (
            filteredPlayers.map(player => (
              <div
                key={player.uuid}
                className={`pm-player-item ${selectedPlayer?.uuid === player.uuid ? 'selected' : ''}`}
                onClick={() => selectPlayer(player)}
              >
                <div className={`pm-status-dot ${player.online ? 'online' : 'offline'}`} />
                <img
                  src={`https://mc-heads.net/avatar/${player.uuid}/32`}
                  alt=""
                  className="pm-player-avatar"
                  loading="lazy"
                />
                <div className="pm-player-info">
                  <span className="pm-player-name">{player.name}</span>
                  {!player.online && player.lastSeen && (
                    <span className="pm-last-seen">{formatDate(player.lastSeen)}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Player Detail */}
        {selectedPlayer && (
          <div className="pm-detail-panel">
            {detailLoading ? (
              <div className="pm-detail-loading">Caricamento dati giocatore...</div>
            ) : playerDetail ? (
              <>
                {/* Header */}
                <div className="pm-detail-header">
                  <img
                    src={`https://mc-heads.net/body/${selectedPlayer.uuid}/100`}
                    alt=""
                    className="pm-detail-avatar"
                  />
                  <div className="pm-detail-title">
                    <h3>{playerDetail.name}</h3>
                    <div className="pm-detail-badges">
                      <span className={`pm-badge pm-badge-${selectedPlayer.online ? 'online' : 'offline'}`}>
                        {selectedPlayer.online ? 'Online' : 'Offline'}
                      </span>
                      <span className="pm-badge pm-badge-gamemode">{playerDetail.gameMode}</span>
                    </div>
                    <span className="pm-uuid">{selectedPlayer.uuid}</span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="pm-stats-grid">
                  <div className="pm-stat">
                    <div className="pm-stat-label"><MapPin size={12} /> Posizione</div>
                    <div className="pm-stat-value">
                      {playerDetail.position
                        ? `${playerDetail.position.x}, ${playerDetail.position.y}, ${playerDetail.position.z}`
                        : 'N/A'}
                    </div>
                  </div>
                  <div className="pm-stat">
                    <div className="pm-stat-label">Dimensione</div>
                    <div className="pm-stat-value">{playerDetail.dimensionName}</div>
                  </div>
                  <div className="pm-stat">
                    <div className="pm-stat-label"><Heart size={12} /> Vita</div>
                    <div className="pm-stat-value">
                      <div className="pm-bar">
                        <div className="pm-bar-fill pm-health-bar" style={{ width: `${(playerDetail.health / 20) * 100}%` }} />
                      </div>
                      <span>{Math.round(playerDetail.health * 10) / 10}/20</span>
                    </div>
                  </div>
                  <div className="pm-stat">
                    <div className="pm-stat-label"><Utensils size={12} /> Fame</div>
                    <div className="pm-stat-value">
                      <div className="pm-bar">
                        <div className="pm-bar-fill pm-food-bar" style={{ width: `${(playerDetail.foodLevel / 20) * 100}%` }} />
                      </div>
                      <span>{playerDetail.foodLevel}/20</span>
                    </div>
                  </div>
                  <div className="pm-stat">
                    <div className="pm-stat-label"><Star size={12} /> XP</div>
                    <div className="pm-stat-value">Livello {playerDetail.xpLevel} ({playerDetail.xpTotal} totale)</div>
                  </div>
                  <div className="pm-stat">
                    <div className="pm-stat-label">Punteggio</div>
                    <div className="pm-stat-value">{playerDetail.score}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pm-actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => executeAction('op', selectedPlayer.name)}
                    disabled={actionLoading.op}
                  >
                    <Shield size={14} /> OP
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => executeAction('deop', selectedPlayer.name)}
                    disabled={actionLoading.deop}
                  >
                    <ShieldOff size={14} /> De-OP
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => executeAction('whitelist-add', selectedPlayer.name)}
                    disabled={actionLoading['whitelist-add']}
                  >
                    <UserPlus size={14} /> Whitelist
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => executeAction('whitelist-remove', selectedPlayer.name)}
                    disabled={actionLoading['whitelist-remove']}
                  >
                    <UserMinus size={14} /> Rimuovi WL
                  </button>
                  <button
                    className="btn btn-sm btn-warning"
                    onClick={() => executeAction('kick', selectedPlayer.name)}
                    disabled={actionLoading.kick || !selectedPlayer.online}
                  >
                    <UserX size={14} /> Kick
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => executeAction('ban', selectedPlayer.name)}
                    disabled={actionLoading.ban}
                  >
                    <Ban size={14} /> Ban
                  </button>
                </div>

                {/* Game Stats */}
                {playerDetail.stats && (
                  <div className="pm-section">
                    <div className="pm-section-header" onClick={() => toggleSection('stats')}>
                      <h4><Swords size={14} /> Statistiche</h4>
                      {expandedSections.stats ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {expandedSections.stats && (
                      <div className="pm-stats-detail">
                        {playerDetail.stats.playTimeHours !== undefined && (
                          <div className="pm-stat-row"><Clock size={12} /><span>Tempo di gioco</span><strong>{playerDetail.stats.playTimeHours}h</strong></div>
                        )}
                        {playerDetail.stats.deaths !== undefined && (
                          <div className="pm-stat-row"><Skull size={12} /><span>Morti</span><strong>{playerDetail.stats.deaths}</strong></div>
                        )}
                        {playerDetail.stats.mobKills !== undefined && (
                          <div className="pm-stat-row"><Swords size={12} /><span>Mob uccisi</span><strong>{playerDetail.stats.mobKills}</strong></div>
                        )}
                        {playerDetail.stats.playerKills !== undefined && (
                          <div className="pm-stat-row"><UserX size={12} /><span>Giocatori uccisi</span><strong>{playerDetail.stats.playerKills}</strong></div>
                        )}
                        {playerDetail.stats.walkDistanceKm !== undefined && (
                          <div className="pm-stat-row"><Footprints size={12} /><span>Distanza camminata</span><strong>{playerDetail.stats.walkDistanceKm} km</strong></div>
                        )}
                        {playerDetail.stats.totalBlocksMined !== undefined && (
                          <div className="pm-stat-row"><Package size={12} /><span>Blocchi minati</span><strong>{playerDetail.stats.totalBlocksMined.toLocaleString()}</strong></div>
                        )}
                        {playerDetail.stats.totalItemsCrafted !== undefined && (
                          <div className="pm-stat-row"><Star size={12} /><span>Oggetti craftati</span><strong>{playerDetail.stats.totalItemsCrafted.toLocaleString()}</strong></div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Advancements */}
                {playerDetail.advancements && (
                  <div className="pm-section">
                    <div className="pm-section-header" onClick={() => toggleSection('advancements')}>
                      <h4><Star size={14} /> Avanzamenti</h4>
                      {expandedSections.advancements ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {expandedSections.advancements && (
                      <div className="pm-advancements-summary">
                        {playerDetail.advancements.completed}/{playerDetail.advancements.total} completati
                      </div>
                    )}
                  </div>
                )}

                {/* Inventory */}
                <div className="pm-section">
                  <div className="pm-section-header" onClick={() => toggleSection('inventory')}>
                    <h4><Package size={14} /> Inventario</h4>
                    {expandedSections.inventory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  {expandedSections.inventory && playerDetail.inventory && (() => {
                    const { slots, armor, offhand } = buildInventoryGrid(playerDetail.inventory);
                    return (
                      <div className="pm-inventory">
                        <div className="pm-inv-section">
                          <span className="pm-inv-label">Armatura</span>
                          <div className="pm-armor-grid">
                            {armor.map((item, i) => renderSlot(item, `armor-${i}`))}
                            {renderSlot(offhand, 'offhand')}
                          </div>
                        </div>
                        <div className="pm-inv-section">
                          <span className="pm-inv-label">Hotbar</span>
                          <div className="pm-inventory-grid">
                            {slots.slice(0, 9).map((item, i) => renderSlot(item, `hot-${i}`))}
                          </div>
                        </div>
                        <div className="pm-inv-section">
                          <span className="pm-inv-label">Inventario</span>
                          <div className="pm-inventory-grid">
                            {slots.slice(9, 36).map((item, i) => renderSlot(item, `inv-${i}`))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Ender Chest */}
                <div className="pm-section">
                  <div className="pm-section-header" onClick={() => toggleSection('enderChest')}>
                    <h4><Package size={14} /> Ender Chest</h4>
                    {expandedSections.enderChest ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  {expandedSections.enderChest && playerDetail.enderItems && (
                    <div className="pm-inventory">
                      <div className="pm-inventory-grid">
                        {buildEnderGrid(playerDetail.enderItems).map((item, i) => renderSlot(item, `ender-${i}`))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="pm-detail-loading">Errore nel caricamento dei dati</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

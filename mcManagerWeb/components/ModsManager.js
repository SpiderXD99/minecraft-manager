import { useState, useEffect } from 'react';
import {
  Search, Download, Trash2, RefreshCw, Check, X, Loader,
  Package, Power, PowerOff, ArrowUpCircle, ExternalLink,
  Box, Puzzle, ChevronDown, AlertCircle, SlidersHorizontal,
  ArrowDownWideNarrow, Calendar, Type, Link2
} from 'lucide-react';

export default function ModsManager({ serverId, serverType, minecraftVersion, modpack, onUpdate }) {
  // Tab state
  const [activeTab, setActiveTab] = useState('browse'); // 'browse', 'installed', 'updates'

  // Source filter
  const [source, setSource] = useState('modrinth'); // 'modrinth', 'curseforge', 'both'
  const [curseforgeAvailable, setCurseforgeAvailable] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Filter and sort state
  const [sortBy, setSortBy] = useState('downloads'); // 'downloads', 'updated', 'name'
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(''); // category slug

  // Installed mods state
  const [installedMods, setInstalledMods] = useState([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [serverLoaders, setServerLoaders] = useState([]);
  const [modFolder, setModFolder] = useState('mods');

  // Updates state
  const [updates, setUpdates] = useState([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  // Action states
  const [installing, setInstalling] = useState({}); // { modId: true/false }
  const [removing, setRemoving] = useState({});
  const [updating, setUpdating] = useState({});
  const [toggling, setToggling] = useState({});

  // Version selector state
  const [showVersions, setShowVersions] = useState(null); // modId or null
  const [modVersions, setModVersions] = useState({}); // { modId: versions[] }
  const [loadingVersions, setLoadingVersions] = useState({});

  // Dependency modal state
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const [pendingInstall, setPendingInstall] = useState(null); // { mod, versionId, dependencies }
  const [checkingDependencies, setCheckingDependencies] = useState({});
  const [selectedDependencies, setSelectedDependencies] = useState(new Set());
  const [installingDependencies, setInstallingDependencies] = useState(false);

  // Modpack management state
  const [modpackSearch, setModpackSearch] = useState('');
  const [modpackResults, setModpackResults] = useState([]);
  const [modpackSearching, setModpackSearching] = useState(false);
  const [modpackInstalling, setModpackInstalling] = useState(false);
  const [removingModpack, setRemovingModpack] = useState(false);

  // Determine project type based on server type
  const projectType = ['paper', 'spigot', 'purpur', 'velocity', 'waterfall'].includes(serverType)
    ? 'plugin'
    : 'mod';

  // Load installed mods
  useEffect(() => {
    loadInstalledMods();
  }, [serverId]);

  // Check CurseForge availability and load suggestions on mount and source change
  useEffect(() => {
    const loadSuggestions = async () => {
      // Don't load suggestions if user has already searched
      if (hasSearched) return;

      setLoadingSuggestions(true);
      try {
        // Popular search terms based on project type
        const popularTerms = projectType === 'plugin'
          ? ['essentials', 'worldedit', 'vault', 'luckperms', 'citizens']
          : ['sodium', 'iris', 'jei', 'create', 'fabric api'];

        // Pick a random popular term to show variety
        const randomTerm = popularTerms[Math.floor(Math.random() * popularTerms.length)];

        const params = new URLSearchParams({
          q: randomTerm,
          source: source,
          projectType,
          loaders: serverLoaders.join(','),
          gameVersion: minecraftVersion || '',
          limit: '12'
        });

        const res = await fetch(`/api/mods/search?${params}`);
        const data = await res.json();
        setSuggestions(data.mods || []);
        setCurseforgeAvailable(data.curseforgeAvailable || false);
      } catch (error) {
        console.error('Error loading suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    };
    loadSuggestions();
  }, [projectType, serverLoaders, minecraftVersion, source, hasSearched]);

  const loadInstalledMods = async () => {
    setLoadingInstalled(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/mods`);
      const data = await res.json();
      setInstalledMods(data.mods || []);
      setServerLoaders(data.loaders || []);
      setModFolder(data.modFolder || 'mods');
    } catch (error) {
      console.error('Error loading installed mods:', error);
    } finally {
      setLoadingInstalled(false);
    }
  };

  // Sort results based on selected option
  const sortResults = (mods) => {
    const sorted = [...mods];
    switch (sortBy) {
      case 'downloads':
        return sorted.sort((a, b) => b.downloads - a.downloads);
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'updated':
        return sorted.sort((a, b) => {
          // Use dateModified if available, otherwise keep original order
          if (a.dateModified && b.dateModified) {
            return new Date(b.dateModified) - new Date(a.dateModified);
          }
          return 0;
        });
      default:
        return sorted;
    }
  };

  // Filter results by category
  const filterResults = (mods) => {
    if (!categoryFilter) return mods;
    return mods.filter(mod =>
      mod.categories?.some(cat =>
        cat.toLowerCase().includes(categoryFilter.toLowerCase())
      )
    );
  };

  // Get sorted and filtered results (or suggestions if no search yet)
  const getDisplayResults = () => {
    const modsToDisplay = hasSearched ? searchResults : suggestions;
    return sortResults(filterResults(modsToDisplay));
  };

  // Search mods
  const searchMods = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        source,
        projectType,
        loaders: serverLoaders.join(','),
        gameVersion: minecraftVersion || ''
      });

      const res = await fetch(`/api/mods/search?${params}`);
      const data = await res.json();
      setSearchResults(data.mods || []);
      setCurseforgeAvailable(data.curseforgeAvailable || false);
    } catch (error) {
      console.error('Error searching mods:', error);
    } finally {
      setSearching(false);
    }
  };

  // Handle search on Enter
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      searchMods();
    }
  };

  // Check for updates
  const checkUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/mods/check-updates`);
      const data = await res.json();
      setUpdates(data.updates || []);
    } catch (error) {
      console.error('Error checking updates:', error);
    } finally {
      setCheckingUpdates(false);
    }
  };

  // Load versions for a mod
  const loadVersions = async (mod) => {
    if (showVersions === mod.id) {
      setShowVersions(null);
      return;
    }

    setShowVersions(mod.id);

    if (modVersions[mod.id]) return;

    setLoadingVersions(prev => ({ ...prev, [mod.id]: true }));
    try {
      const params = new URLSearchParams({
        loaders: serverLoaders.join(','),
        gameVersion: minecraftVersion || ''
      });

      // Use our search API to get the mod, then fetch versions
      const res = await fetch(`/api/mods/search?q=${mod.slug || mod.name}&source=${mod.source}`);
      const searchData = await res.json();

      // For now, we'll show version info from search
      // In production, would add a versions endpoint
      setModVersions(prev => ({
        ...prev,
        [mod.id]: searchData.mods?.find(m => m.id === mod.id)?.gameVersions || []
      }));
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setLoadingVersions(prev => ({ ...prev, [mod.id]: false }));
    }
  };

  // Check dependencies before installing
  const checkDependencies = async (mod, versionId = null) => {
    setCheckingDependencies(prev => ({ ...prev, [mod.id]: true }));
    try {
      // First get the latest version if not specified
      let actualVersionId = versionId;
      if (!actualVersionId || actualVersionId === 'latest') {
        const params = new URLSearchParams({
          loaders: serverLoaders.join(','),
          gameVersion: minecraftVersion || ''
        });
        const versionsRes = await fetch(`/api/mods/versions?source=${mod.source}&projectId=${mod.id}&${params}`);
        if (versionsRes.ok) {
          const versionsData = await versionsRes.json();
          if (versionsData.versions && versionsData.versions.length > 0) {
            actualVersionId = versionsData.versions[0].id;
          }
        }
      }

      if (!actualVersionId) {
        // No version found, proceed with installation without dependency check
        await doInstallMod(mod, 'latest');
        return;
      }

      // Check dependencies
      const res = await fetch(`/api/servers/${serverId}/mods/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: mod.source,
          projectId: mod.id,
          versionId: actualVersionId
        })
      });

      if (!res.ok) {
        // If dependency check fails, proceed with installation anyway
        await doInstallMod(mod, actualVersionId);
        return;
      }

      const data = await res.json();

      if (data.dependencies && data.dependencies.length > 0) {
        // Show dependency modal
        setPendingInstall({
          mod,
          versionId: actualVersionId,
          dependencies: data.dependencies
        });
        setSelectedDependencies(new Set(data.dependencies.map(d => d.projectId)));
        setShowDependencyModal(true);
      } else {
        // No dependencies, proceed with installation
        await doInstallMod(mod, actualVersionId);
      }
    } catch (error) {
      console.error('Error checking dependencies:', error);
      // On error, proceed with installation
      await doInstallMod(mod, versionId || 'latest');
    } finally {
      setCheckingDependencies(prev => ({ ...prev, [mod.id]: false }));
    }
  };

  // Install a mod directly without dependency check
  const doInstallMod = async (mod, versionId) => {
    setInstalling(prev => ({ ...prev, [mod.id]: true }));
    try {
      const res = await fetch(`/api/servers/${serverId}/mods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: mod.source,
          projectId: mod.id,
          versionId: versionId || 'latest',
          name: mod.name,
          slug: mod.slug
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Installation failed');
      }

      await loadInstalledMods();
      setShowVersions(null);
      return true;
    } catch (error) {
      console.error('Error installing mod:', error);
      alert(`Errore installazione: ${error.message}`);
      return false;
    } finally {
      setInstalling(prev => ({ ...prev, [mod.id]: false }));
    }
  };

  // Install mod with selected dependencies
  const installWithDependencies = async () => {
    if (!pendingInstall) return;

    setInstallingDependencies(true);
    try {
      // Install selected dependencies first
      const selectedDeps = pendingInstall.dependencies.filter(d =>
        selectedDependencies.has(d.projectId) && d.latestVersionId
      );

      for (const dep of selectedDeps) {
        try {
          const res = await fetch(`/api/servers/${serverId}/mods`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: dep.source,
              projectId: dep.projectId,
              versionId: dep.latestVersionId,
              name: dep.name,
              slug: dep.slug
            })
          });

          if (!res.ok) {
            console.error(`Failed to install dependency ${dep.name}`);
          }
        } catch (error) {
          console.error(`Error installing dependency ${dep.name}:`, error);
        }
      }

      // Then install the main mod
      await doInstallMod(pendingInstall.mod, pendingInstall.versionId);

      // Close modal
      setShowDependencyModal(false);
      setPendingInstall(null);
      setSelectedDependencies(new Set());
    } catch (error) {
      console.error('Error installing with dependencies:', error);
      alert(`Errore installazione: ${error.message}`);
    } finally {
      setInstallingDependencies(false);
    }
  };

  // Skip dependencies and install only the main mod
  const skipDependencies = async () => {
    if (!pendingInstall) return;

    setInstallingDependencies(true);
    try {
      await doInstallMod(pendingInstall.mod, pendingInstall.versionId);
      setShowDependencyModal(false);
      setPendingInstall(null);
      setSelectedDependencies(new Set());
    } finally {
      setInstallingDependencies(false);
    }
  };

  // Toggle dependency selection
  const toggleDependencySelection = (projectId) => {
    const newSelected = new Set(selectedDependencies);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedDependencies(newSelected);
  };

  // Install a mod (entry point - checks dependencies first)
  const installMod = async (mod, versionId = null) => {
    await checkDependencies(mod, versionId);
  };

  // Remove a mod
  const removeMod = async (mod) => {
    if (!confirm(`Rimuovere ${mod.name}?`)) return;

    const modId = mod.id || `orphan:${mod.fileName}`;
    setRemoving(prev => ({ ...prev, [modId]: true }));
    try {
      const params = mod.orphan ? `?fileName=${encodeURIComponent(mod.fileName)}` : '';
      const res = await fetch(`/api/servers/${serverId}/mods/${encodeURIComponent(mod.id || 'orphan')}${params}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Removal failed');
      }

      await loadInstalledMods();
    } catch (error) {
      console.error('Error removing mod:', error);
      alert(`Errore rimozione: ${error.message}`);
    } finally {
      setRemoving(prev => ({ ...prev, [modId]: false }));
    }
  };

  // Toggle mod enabled/disabled
  const toggleMod = async (mod) => {
    const modId = mod.id || `orphan:${mod.fileName}`;
    setToggling(prev => ({ ...prev, [modId]: true }));
    try {
      const res = await fetch(`/api/servers/${serverId}/mods/${encodeURIComponent(mod.id || 'orphan')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle',
          fileName: mod.fileName
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Toggle failed');
      }

      await loadInstalledMods();
    } catch (error) {
      console.error('Error toggling mod:', error);
      alert(`Errore: ${error.message}`);
    } finally {
      setToggling(prev => ({ ...prev, [modId]: false }));
    }
  };

  // Update a mod
  const updateMod = async (mod) => {
    setUpdating(prev => ({ ...prev, [mod.id]: true }));
    try {
      const res = await fetch(`/api/servers/${serverId}/mods/${encodeURIComponent(mod.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          versionId: mod.latestVersionId
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Update failed');
      }

      await loadInstalledMods();
      await checkUpdates();
    } catch (error) {
      console.error('Error updating mod:', error);
      alert(`Errore aggiornamento: ${error.message}`);
    } finally {
      setUpdating(prev => ({ ...prev, [mod.id]: false }));
    }
  };

  // Format download count
  const formatDownloads = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Get mod official page URL
  const getModUrl = (mod) => {
    if (mod.source === 'modrinth') {
      const type = projectType === 'plugin' ? 'plugin' : 'mod';
      return `https://modrinth.com/${type}/${mod.slug || mod.id}`;
    } else if (mod.source === 'curseforge') {
      const type = projectType === 'plugin' ? 'bukkit-plugins' : 'mc-mods';
      return `https://www.curseforge.com/minecraft/${type}/${mod.slug || mod.id}`;
    }
    return null;
  };

  // Get search URL for a mod name (used for orphan mods)
  const getSearchUrl = (modName, platform) => {
    // Clean up mod name - remove version numbers, file extensions, and common suffixes
    const cleanName = modName
      .replace(/\.jar(\.disabled)?$/i, '')
      .replace(/[-_][\d.]+.*$/, '') // Remove version numbers like -1.2.3 or _1.2.3
      .replace(/[-_](fabric|forge|bukkit|spigot|paper|mc\d+)/gi, '') // Remove loader suffixes
      .replace(/[-_]/g, ' ') // Replace separators with spaces
      .trim();

    const encodedName = encodeURIComponent(cleanName);

    if (platform === 'modrinth') {
      const type = projectType === 'plugin' ? 'plugins' : 'mods';
      return `https://modrinth.com/${type}?q=${encodedName}`;
    } else if (platform === 'curseforge') {
      const type = projectType === 'plugin' ? 'bukkit-plugins' : 'mc-mods';
      return `https://www.curseforge.com/minecraft/${type}/search?search=${encodedName}`;
    }
    return null;
  };

  // Check if a mod is already installed
  const isInstalled = (mod) => {
    return installedMods.some(m =>
      m.projectId === mod.id || m.slug === mod.slug
    );
  };

  // Modpack functions
  const searchModpacks = async () => {
    if (!modpackSearch.trim()) return;
    setModpackSearching(true);
    try {
      const params = new URLSearchParams({
        q: modpackSearch,
        source: source,
        projectType: 'modpack',
        limit: '20'
      });
      const res = await fetch(`/api/mods/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setModpackResults(data.mods || []);
      }
    } catch (error) {
      console.error('Modpack search error:', error);
    } finally {
      setModpackSearching(false);
    }
  };

  const installModpack = async (mp) => {
    if (!confirm(`Installare il modpack "${mp.name}"? Il server type verrà gestito dal modpack. Richiederà un riavvio del server.`)) return;
    setModpackInstalling(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/modpack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: mp.source,
          slug: mp.slug,
          name: mp.name,
          projectId: mp.id
        })
      });
      if (res.ok) {
        setModpackResults([]);
        setModpackSearch('');
        if (onUpdate) onUpdate();
        alert('Modpack configurato! Riavvia il server per applicare.');
      } else {
        const data = await res.json();
        alert(data.error || 'Errore installazione modpack');
      }
    } catch (error) {
      alert('Errore installazione modpack');
    } finally {
      setModpackInstalling(false);
    }
  };

  const removeModpack = async () => {
    if (!confirm('Rimuovere il modpack? Il server tornerà alla configurazione normale. Richiederà un riavvio.')) return;
    setRemovingModpack(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/modpack`, { method: 'DELETE' });
      if (res.ok) {
        if (onUpdate) onUpdate();
        alert('Modpack rimosso! Riavvia il server per applicare.');
      } else {
        const data = await res.json();
        alert(data.error || 'Errore rimozione modpack');
      }
    } catch (error) {
      alert('Errore rimozione modpack');
    } finally {
      setRemovingModpack(false);
    }
  };

  return (
    <div className="mods-manager">
      {/* Unified Header - Tabs + Source + Search in one row */}
      <div className="mods-unified-header">
        <div className="mods-tabs-compact">
          <button
            className={`mods-tab ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            <Search size={14} />
            Cerca
          </button>
          <button
            className={`mods-tab ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            <Package size={14} />
            Installati ({installedMods.length})
          </button>
          <button
            className={`mods-tab ${activeTab === 'updates' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('updates');
              if (updates.length === 0) checkUpdates();
            }}
          >
            <ArrowUpCircle size={14} />
            Aggiornamenti {updates.length > 0 && `(${updates.length})`}
          </button>
          <button
            className={`mods-tab ${activeTab === 'modpack' ? 'active' : ''}`}
            onClick={() => setActiveTab('modpack')}
          >
            <Box size={14} />
            Modpack {modpack && '●'}
          </button>
        </div>

        <div className="mods-source-toggle-compact">
          <button
            className={source === 'modrinth' ? 'active' : ''}
            onClick={() => setSource('modrinth')}
            title="Modrinth"
          >
            Modrinth
          </button>
          <button
            className={source === 'curseforge' ? 'active' : ''}
            onClick={() => setSource('curseforge')}
            disabled={!curseforgeAvailable}
            title={curseforgeAvailable ? 'CurseForge' : 'CurseForge API non configurata'}
          >
            CurseForge
          </button>
          <button
            className={source === 'both' ? 'active' : ''}
            onClick={() => setSource('both')}
            disabled={!curseforgeAvailable}
          >
            Entrambi
          </button>
        </div>

        <div className="mods-search-compact">
          <Search size={14} />
          <input
            type="text"
            placeholder={`Cerca ${projectType === 'plugin' ? 'plugin' : 'mod'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <button onClick={searchMods} disabled={searching || !searchQuery.trim()}>
            {searching ? <Loader size={14} className="spin" /> : 'Cerca'}
          </button>
        </div>

        <div className="mods-info-compact">
          <span className="mods-server-type">
            {projectType === 'plugin' ? <Puzzle size={12} /> : <Box size={12} />}
            {serverType}
          </span>
        </div>
      </div>

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <div className="mods-browse">

          {/* Filters and Sort */}
          {(searchResults.length > 0 || suggestions.length > 0) && (
            <div className="mods-filters-bar">
              <div className="mods-sort">
                <span className="mods-sort-label">Ordina per:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="mods-sort-select"
                >
                  <option value="downloads">Popolarità</option>
                  <option value="name">Nome (A-Z)</option>
                  <option value="updated">Aggiornati di recente</option>
                </select>
              </div>

              <div className="mods-filter">
                <input
                  type="text"
                  placeholder="Filtra per categoria..."
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="mods-filter-input"
                />
                {categoryFilter && (
                  <button
                    className="mods-filter-clear"
                    onClick={() => setCategoryFilter('')}
                    title="Cancella filtro"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <span className="mods-results-count">
                {getDisplayResults().length} risultati
              </span>
            </div>
          )}

          {(searching || loadingSuggestions) && (
            <div className="mods-loading">
              <Loader size={24} className="spin" />
              <span>{searching ? 'Ricerca in corso...' : 'Caricamento suggerimenti...'}</span>
            </div>
          )}

          {!searching && !loadingSuggestions && hasSearched && searchResults.length === 0 && (
            <div className="mods-empty">
              <AlertCircle size={24} />
              <span>Nessun risultato trovato</span>
            </div>
          )}

          {/* Suggestions label when not searched yet */}
          {!searching && !loadingSuggestions && !hasSearched && suggestions.length > 0 && (
            <div className="mods-suggestions-header">
              <span className="mods-suggestions-label">
                Popolari per {projectType === 'plugin' ? 'Plugin' : 'Mod'}
              </span>
            </div>
          )}

          <div className="mods-grid">
            {getDisplayResults().map((mod) => (
              <div key={`${mod.source}-${mod.id}`} className="mod-card">
                <div className="mod-card-header">
                  {mod.icon ? (
                    <img src={mod.icon} alt={mod.name} className="mod-icon" />
                  ) : (
                    <div className="mod-icon-placeholder">
                      {projectType === 'plugin' ? <Puzzle size={24} /> : <Box size={24} />}
                    </div>
                  )}
                  <div className="mod-card-info">
                    <h4>{mod.name}</h4>
                    <span className="mod-author">di {mod.author}</span>
                  </div>
                  <span className={`mod-source-badge ${mod.source}`}>
                    {mod.source === 'modrinth' ? 'M' : 'CF'}
                  </span>
                </div>

                <p className="mod-description">{mod.description}</p>

                <div className="mod-card-footer">
                  <span className="mod-downloads">
                    <Download size={14} />
                    {formatDownloads(mod.downloads)}
                  </span>

                  <div className="mod-card-actions">
                    <a
                      href={getModUrl(mod)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mod-link-btn"
                      title="Apri pagina ufficiale"
                    >
                      <ExternalLink size={14} />
                    </a>

                    {isInstalled(mod) ? (
                      <span className="mod-installed-badge">
                        <Check size={14} /> Installato
                      </span>
                    ) : (
                      <button
                        className="mod-install-btn"
                        onClick={() => installMod(mod)}
                        disabled={installing[mod.id] || checkingDependencies[mod.id]}
                      >
                        {installing[mod.id] || checkingDependencies[mod.id] ? (
                          <Loader size={14} className="spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        {checkingDependencies[mod.id] ? 'Controllo...' : 'Installa'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Installed Tab */}
      {activeTab === 'installed' && (
        <div className="mods-installed">
          <div className="mods-installed-header">
            <button onClick={loadInstalledMods} disabled={loadingInstalled}>
              <RefreshCw size={16} className={loadingInstalled ? 'spin' : ''} />
              Aggiorna
            </button>
          </div>

          {loadingInstalled && (
            <div className="mods-loading">
              <Loader size={24} className="spin" />
              <span>Caricamento...</span>
            </div>
          )}

          {!loadingInstalled && installedMods.length === 0 && (
            <div className="mods-empty">
              <Package size={24} />
              <span>Nessun {projectType === 'plugin' ? 'plugin' : 'mod'} installato</span>
            </div>
          )}

          <div className="mods-installed-list">
            {installedMods.map((mod) => {
              const modId = mod.id || `orphan:${mod.fileName}`;
              return (
                <div
                  key={modId}
                  className={`mod-installed-item ${!mod.enabled ? 'disabled' : ''} ${mod.orphan ? 'orphan' : ''}`}
                >
                  <div className="mod-installed-info">
                    <div className="mod-installed-name">
                      {mod.orphan && <AlertCircle size={14} title="File non tracciato" />}
                      <span>{mod.name}</span>
                      {mod.installedVersion && (
                        <span className="mod-version">v{mod.installedVersion}</span>
                      )}
                    </div>
                    <span className="mod-filename">{mod.fileName}</span>
                  </div>

                  <div className="mod-installed-actions">
                    {!mod.orphan && mod.source ? (
                      <>
                        <span className={`mod-source-badge small ${mod.source}`}>
                          {mod.source === 'modrinth' ? 'M' : 'CF'}
                        </span>
                        <a
                          href={getModUrl(mod)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mod-link-btn small"
                          title="Apri pagina ufficiale"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </>
                    ) : mod.orphan && (
                      <>
                        <a
                          href={getSearchUrl(mod.name || mod.fileName, 'modrinth')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mod-source-badge small modrinth clickable"
                          title="Cerca su Modrinth"
                        >
                          M
                        </a>
                        <a
                          href={getSearchUrl(mod.name || mod.fileName, 'curseforge')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mod-source-badge small curseforge clickable"
                          title="Cerca su CurseForge"
                        >
                          CF
                        </a>
                      </>
                    )}

                    <button
                      className={`mod-toggle-btn ${mod.enabled ? 'enabled' : 'disabled'}`}
                      onClick={() => toggleMod(mod)}
                      disabled={toggling[modId]}
                      title={mod.enabled ? 'Disabilita' : 'Abilita'}
                    >
                      {toggling[modId] ? (
                        <Loader size={14} className="spin" />
                      ) : mod.enabled ? (
                        <Power size={14} />
                      ) : (
                        <PowerOff size={14} />
                      )}
                    </button>

                    <button
                      className="mod-remove-btn"
                      onClick={() => removeMod(mod)}
                      disabled={removing[modId]}
                      title="Rimuovi"
                    >
                      {removing[modId] ? (
                        <Loader size={14} className="spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Updates Tab */}
      {activeTab === 'updates' && (
        <div className="mods-updates">
          <div className="mods-updates-header">
            <button onClick={checkUpdates} disabled={checkingUpdates}>
              <RefreshCw size={16} className={checkingUpdates ? 'spin' : ''} />
              Controlla aggiornamenti
            </button>
            {updates.length > 0 && (
              <button
                className="update-all-btn"
                onClick={() => updates.forEach(mod => updateMod(mod))}
              >
                <ArrowUpCircle size={16} />
                Aggiorna tutti
              </button>
            )}
          </div>

          {checkingUpdates && (
            <div className="mods-loading">
              <Loader size={24} className="spin" />
              <span>Controllo aggiornamenti...</span>
            </div>
          )}

          {!checkingUpdates && updates.length === 0 && (
            <div className="mods-empty">
              <Check size={24} />
              <span>Tutti i {projectType === 'plugin' ? 'plugin' : 'mod'} sono aggiornati</span>
            </div>
          )}

          <div className="mods-updates-list">
            {updates.map((mod) => (
              <div key={mod.id} className="mod-update-item">
                <div className="mod-update-info">
                  <span className="mod-name">{mod.name}</span>
                  <div className="mod-versions">
                    <span className="version-current">{mod.installedVersion}</span>
                    <span className="version-arrow">→</span>
                    <span className="version-new">{mod.latestVersion}</span>
                  </div>
                </div>

                <button
                  className="mod-update-btn"
                  onClick={() => updateMod(mod)}
                  disabled={updating[mod.id]}
                >
                  {updating[mod.id] ? (
                    <Loader size={14} className="spin" />
                  ) : (
                    <ArrowUpCircle size={14} />
                  )}
                  Aggiorna
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modpack Tab */}
      {activeTab === 'modpack' && (
        <div className="mods-modpack-tab">
          {/* Current modpack banner */}
          {modpack ? (
            <div className="modpack-active-banner">
              <div className="modpack-active-info">
                <Box size={20} />
                <div>
                  <strong>{modpack.name}</strong>
                  <span className={`modpack-source-badge ${modpack.source}`}>{modpack.source}</span>
                </div>
              </div>
              <button
                className="btn btn-danger modpack-remove-btn"
                onClick={removeModpack}
                disabled={removingModpack}
              >
                {removingModpack ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                Rimuovi Modpack
              </button>
            </div>
          ) : (
            <div className="modpack-empty-banner">
              <Box size={20} />
              <span>Nessun modpack installato. Cerca e installa un modpack qui sotto.</span>
            </div>
          )}

          {/* Modpack search */}
          <div className="modpack-search-section">
            <div className="modpack-search-bar">
              <Search size={14} />
              <input
                type="text"
                placeholder="Cerca modpack..."
                value={modpackSearch}
                onChange={(e) => setModpackSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchModpacks(); }}
              />
              <button onClick={searchModpacks} disabled={modpackSearching || !modpackSearch.trim()}>
                {modpackSearching ? <Loader size={14} className="spin" /> : 'Cerca'}
              </button>
            </div>

            {modpackResults.length > 0 && (
              <div className="modpack-results-list">
                {modpackResults.map(mp => (
                  <div key={`${mp.source}-${mp.id}`} className="modpack-result-card">
                    {mp.icon && <img src={mp.icon} alt="" className="modpack-result-icon" />}
                    <div className="modpack-result-info">
                      <div className="modpack-result-header">
                        <span className="modpack-result-name">{mp.name}</span>
                        <span className={`modpack-source-badge ${mp.source}`}>{mp.source}</span>
                      </div>
                      <div className="modpack-result-meta">
                        <span>{mp.author}</span>
                        <span>{mp.downloads?.toLocaleString()} downloads</span>
                      </div>
                      <p className="modpack-result-desc">{mp.description}</p>
                    </div>
                    <button
                      className="btn btn-primary modpack-install-btn"
                      onClick={() => installModpack(mp)}
                      disabled={modpackInstalling}
                    >
                      {modpackInstalling ? <Loader size={14} className="spin" /> : <Download size={14} />}
                      Installa
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!modpackSearching && modpackResults.length === 0 && modpackSearch && (
              <div className="mods-empty">
                <Package size={24} />
                <span>Cerca un modpack per iniziare</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dependency Confirmation Modal */}
      {showDependencyModal && pendingInstall && (
        <div className="dependency-modal-overlay">
          <div className="dependency-modal">
            <div className="dependency-modal-header">
              <h3>
                <Link2 size={20} />
                Dipendenze richieste
              </h3>
              <button
                className="dependency-modal-close"
                onClick={() => {
                  setShowDependencyModal(false);
                  setPendingInstall(null);
                  setSelectedDependencies(new Set());
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="dependency-modal-content">
              <p className="dependency-modal-intro">
                <strong>{pendingInstall.mod.name}</strong> richiede le seguenti dipendenze per funzionare correttamente:
              </p>

              <div className="dependency-list">
                {pendingInstall.dependencies.map((dep) => (
                  <div
                    key={dep.projectId}
                    className={`dependency-item ${!dep.latestVersionId ? 'unavailable' : ''}`}
                  >
                    <label className="dependency-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedDependencies.has(dep.projectId)}
                        onChange={() => toggleDependencySelection(dep.projectId)}
                        disabled={!dep.latestVersionId || dep.noCompatibleVersion}
                      />
                      <span className="checkmark"></span>
                    </label>

                    <div className="dependency-info">
                      {dep.icon && (
                        <img src={dep.icon} alt={dep.name} className="dependency-icon" />
                      )}
                      <div className="dependency-details">
                        <span className="dependency-name">{dep.name}</span>
                        {dep.description && (
                          <span className="dependency-description">{dep.description}</span>
                        )}
                        {dep.latestVersionNumber && (
                          <span className="dependency-version">v{dep.latestVersionNumber}</span>
                        )}
                        {dep.noCompatibleVersion && (
                          <span className="dependency-warning">
                            <AlertCircle size={12} />
                            Nessuna versione compatibile trovata
                          </span>
                        )}
                        {dep.error && (
                          <span className="dependency-error">
                            <AlertCircle size={12} />
                            Errore nel recupero versione
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`mod-source-badge small ${dep.source}`}>
                      {dep.source === 'modrinth' ? 'M' : 'CF'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="dependency-modal-footer">
              <button
                className="dependency-btn skip"
                onClick={skipDependencies}
                disabled={installingDependencies}
              >
                Salta dipendenze
              </button>
              <button
                className="dependency-btn install"
                onClick={installWithDependencies}
                disabled={installingDependencies}
              >
                {installingDependencies ? (
                  <>
                    <Loader size={14} className="spin" />
                    Installazione...
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Installa ({selectedDependencies.size + 1} {projectType === 'plugin' ? 'plugin' : 'mod'})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

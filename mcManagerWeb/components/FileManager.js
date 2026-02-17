import { useState, useEffect, useRef } from 'react';
import {
  Home, ChevronUp, FolderPlus, FilePlus, Upload, Archive,
  RefreshCw, Folder, File, Download, Edit3, PackageOpen,
  FolderOpen, Trash2, Save, X, Check, Loader,
  ArrowUpDown, ArrowUp, ArrowDown, Search,
  FileText, FileCode, FileJson, FileImage, FileArchive,
  FileVideo, FileAudio, Settings, Database, FileSpreadsheet,
  WrapText
} from 'lucide-react';
import { io } from 'socket.io-client';

export default function FileManager({ serverId }) {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('file');
  const [createName, setCreateName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState(''); // For cancel functionality
  const [wordWrap, setWordWrap] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [fileSearchVisible, setFileSearchVisible] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const editorRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const previewRef = useRef(null);

  // Sorting state
  const [sortBy, setSortBy] = useState('name'); // 'name', 'size', 'modified'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(null); // { loaded, total, percent, fileName }
  const [uploadXhr, setUploadXhr] = useState(null); // Reference to cancel upload

  // Archive job state
  const [archiveJob, setArchiveJob] = useState(null); // { jobId, status, message, filename, type }
  const socketRef = useRef(null);

  // Socket.IO connection for archive job updates
  useEffect(() => {
    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on(`archive-job-${serverId}`, (data) => {
      setArchiveJob(data);

      if (data.status === 'completed') {
        // Auto-refresh file list and clear job after delay
        loadFiles();
        setTimeout(() => setArchiveJob(null), 3000);
      } else if (data.status === 'error') {
        // Clear error after delay
        setTimeout(() => setArchiveJob(null), 5000);
      }
    });

    return () => {
      socket.off(`archive-job-${serverId}`);
      socket.disconnect();
    };
  }, [serverId]);

  useEffect(() => {
    loadFiles();
  }, [currentPath, serverId]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const url = `/api/servers/${serverId}/files?path=${encodeURIComponent(currentPath)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.type === 'directory') {
        setFiles(data.files || []);
        setSelectedFile(null);
      }
    } catch (error) {
      console.error('Errore caricamento file:', error);
      alert('Errore caricamento file');
    } finally {
      setLoading(false);
    }
  };

  // Binary file extensions that should not be opened as text
  const binaryExtensions = [
    '.zip', '.jar', '.tar', '.gz', '.tgz', '.rar', '.7z',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.exe', '.dll', '.so', '.bin', '.dat',
    '.mp3', '.mp4', '.wav', '.avi', '.mkv', '.mov',
    '.ttf', '.otf', '.woff', '.woff2'
  ];

  const isBinaryFile = (filename) => {
    const lower = filename.toLowerCase();
    return binaryExtensions.some(ext => lower.endsWith(ext));
  };

  const openFile = async (file) => {
    if (file.type === 'directory') {
      setCurrentPath(file.path);
    } else if (isBinaryFile(file.name)) {
      // Binary files: show info and offer download
      setSelectedFile(file);
      setFileContent(null); // null indicates binary file
      setEditMode(false);
    } else {
      // Text files: load content
      try {
        const url = `/api/servers/${serverId}/files?path=${encodeURIComponent(file.path)}`;
        const res = await fetch(url);
        const data = await res.json();
        setSelectedFile(file);
        setFileContent(data.content || '');
        setEditMode(false);
      } catch (error) {
        console.error('Errore apertura file:', error);
        alert('Errore apertura file');
      }
    }
  };

  const goUp = () => {
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const createItem = async () => {
    if (!createName.trim()) {
      alert('Inserisci un nome');
      return;
    }

    try {
      const newPath = currentPath ? `${currentPath}/${createName}` : createName;
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: newPath,
          type: createType,
          content: createType === 'file' ? '' : undefined
        })
      });

      if (res.ok) {
        setShowCreateModal(false);
        setCreateName('');
        loadFiles();
      } else {
        const error = await res.json();
        alert(error.error || 'Errore creazione');
      }
    } catch (error) {
      alert('Errore creazione');
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;

    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.path,
          content: fileContent
        })
      });

      if (res.ok) {
        setEditMode(false);
        alert('File salvato');
      } else {
        alert('Errore salvataggio');
      }
    } catch (error) {
      alert('Errore salvataggio');
    }
  };

  const deleteItem = async (file) => {
    if (!window.confirm(`Eliminare ${file.name}?`)) return;

    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path })
      });

      if (res.ok) {
        loadFiles();
        if (selectedFile?.path === file.path) {
          setSelectedFile(null);
        }
      } else {
        alert('Errore eliminazione');
      }
    } catch (error) {
      alert('Errore eliminazione');
    }
  };

  const downloadFile = (file) => {
    const url = `/api/servers/${serverId}/download?path=${encodeURIComponent(file.path)}`;
    window.open(url, '_blank');
  };

  const cancelUpload = () => {
    if (uploadXhr) {
      uploadXhr.abort();
      setUploadXhr(null);
      setUploadProgress(null);
    }
  };

  const uploadFiles = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const formData = new FormData();
    formData.append('path', currentPath);

    // Calculate total size for progress
    let totalSize = 0;
    const fileNames = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      totalSize += file.size;
      fileNames.push(file.name);
      // Per le cartelle, preserva la struttura dei path
      if (file.webkitRelativePath) {
        formData.append('files', file, file.webkitRelativePath);
      } else {
        formData.append('files', file);
      }
    }

    const fileName = fileList.length === 1 ? fileNames[0] : `${fileList.length} file`;

    // Initialize progress
    setUploadProgress({ loaded: 0, total: totalSize, percent: 0, fileName });

    const xhr = new XMLHttpRequest();
    setUploadXhr(xhr);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress({
          loaded: event.loaded,
          total: event.total,
          percent,
          fileName
        });
      }
    });

    xhr.addEventListener('load', () => {
      setUploadXhr(null);
      setUploadProgress(null);
      e.target.value = '';

      if (xhr.status >= 200 && xhr.status < 300) {
        loadFiles();
        // Show appropriate message based on number of files
        if (fileList.length === 1) {
          alert(`File "${fileNames[0]}" caricato con successo`);
        } else {
          alert(`${fileList.length} file caricati con successo:\n${fileNames.join('\n')}`);
        }
      } else {
        let errorMsg = 'Errore upload';
        try {
          const response = JSON.parse(xhr.responseText);
          errorMsg = response.error || errorMsg;
        } catch {}
        alert(errorMsg);
      }
    });

    xhr.addEventListener('error', () => {
      setUploadXhr(null);
      setUploadProgress(null);
      e.target.value = '';
      alert('Errore di connessione durante l\'upload. Riprova.');
    });

    xhr.addEventListener('abort', () => {
      setUploadXhr(null);
      setUploadProgress(null);
      e.target.value = '';
      alert('Upload annullato');
    });

    xhr.addEventListener('timeout', () => {
      setUploadXhr(null);
      setUploadProgress(null);
      e.target.value = '';
      alert('Upload timeout: la connessione è troppo lenta');
    });

    xhr.open('POST', `/api/servers/${serverId}/upload`);
    xhr.timeout = 10 * 60 * 1000; // 10 minutes timeout
    xhr.send(formData);
  };

  const zipItem = async (file) => {
    if (archiveJob?.status === 'running') {
      alert('Un\'operazione di archiviazione è già in corso');
      return;
    }

    try {
      const res = await fetch(`/api/servers/${serverId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path })
      });

      const data = await res.json();

      if (res.ok || res.status === 202) {
        // Job started in background
        setArchiveJob({
          jobId: data.jobId,
          status: 'running',
          message: 'Compressione in corso...',
          filename: data.filename,
          type: 'compress'
        });
      } else {
        alert(data.error || 'Errore creazione archivio');
      }
    } catch (error) {
      alert('Errore creazione archivio');
    }
  };

  const unzipItem = async (file) => {
    if (archiveJob?.status === 'running') {
      alert('Un\'operazione di archiviazione è già in corso');
      return;
    }

    try {
      const res = await fetch(`/api/servers/${serverId}/archive`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, destination: currentPath })
      });

      const data = await res.json();

      if (res.ok || res.status === 202) {
        // Job started in background
        setArchiveJob({
          jobId: data.jobId,
          status: 'running',
          message: 'Estrazione in corso...',
          filename: data.filename,
          type: 'extract'
        });
      } else {
        alert('Errore estrazione archivio');
      }
    } catch (error) {
      alert('Errore estrazione archivio');
    }
  };

  const startRename = (file) => {
    setRenameTarget(file);
    setNewName(file.name);
    setShowRenameModal(true);
  };

  const renameItem = async () => {
    if (!renameTarget || !newName.trim()) return;

    try {
      // Costruisci il nuovo path preservando la directory corrente
      // Prendi il path del file corrente, rimuovi il nome del file, e aggiungi il nuovo nome
      const pathParts = renameTarget.path.split('/');
      pathParts[pathParts.length - 1] = newName; // Sostituisci l'ultimo elemento (nome file) con il nuovo nome
      const newPath = pathParts.join('/');

      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: renameTarget.path,
          newPath,
          action: 'rename'
        })
      });

      if (res.ok) {
        setShowRenameModal(false);
        setRenameTarget(null);
        setNewName('');
        loadFiles();
      } else {
        const error = await res.json();
        alert(error.error || 'Errore rinomina');
      }
    } catch (error) {
      console.error('Errore rinomina:', error);
      alert('Errore rinomina');
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // File content search - count matches
  const getSearchMatches = () => {
    if (!fileSearch || !fileContent) return 0;
    try {
      const regex = new RegExp(fileSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = fileContent.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  };

  const totalMatches = fileSearchVisible ? getSearchMatches() : 0;

  // Navigate to next/prev match in preview mode
  const navigateMatch = (direction) => {
    if (!previewRef.current || totalMatches === 0) return;
    const highlights = previewRef.current.querySelectorAll('.fm-search-highlight');
    if (highlights.length === 0) return;

    let newIndex = currentMatchIndex + direction;
    if (newIndex < 0) newIndex = highlights.length - 1;
    if (newIndex >= highlights.length) newIndex = 0;
    setCurrentMatchIndex(newIndex);

    // Remove active class from all, add to current
    highlights.forEach(el => el.classList.remove('fm-search-active'));
    highlights[newIndex].classList.add('fm-search-active');
    highlights[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Render text with search highlights
  const renderHighlightedContent = (text) => {
    if (!fileSearch || !text) return text;
    try {
      const escaped = fileSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = text.split(regex);
      let matchIdx = 0;
      return parts.map((part, i) => {
        if (regex.test(part)) {
          regex.lastIndex = 0; // reset after test
          const idx = matchIdx++;
          return (
            <mark key={i} className={`fm-search-highlight ${idx === currentMatchIndex ? 'fm-search-active' : ''}`}>
              {part}
            </mark>
          );
        }
        return part;
      });
    } catch {
      return text;
    }
  };

  // Toggle search with Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && selectedFile && fileContent !== null) {
        e.preventDefault();
        setFileSearchVisible(v => !v);
        if (!fileSearchVisible) {
          setFileSearch('');
          setCurrentMatchIndex(0);
        }
      }
      if (e.key === 'Escape' && fileSearchVisible) {
        setFileSearchVisible(false);
        setFileSearch('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, fileContent, fileSearchVisible]);

  // Sorting logic
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getSortedFiles = () => {
    // Filter by search query
    let filteredFiles = files;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredFiles = files.filter(f => f.name.toLowerCase().includes(query));
    }

    return filteredFiles.sort((a, b) => {
      // Directories always first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'modified':
          comparison = new Date(a.modified) - new Date(b.modified);
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  // Get file icon based on extension
  const getFileIcon = (file) => {
    if (file.type === 'directory') {
      return <Folder size={16} className="fm-icon-folder" />;
    }

    const name = file.name.toLowerCase();
    const ext = name.split('.').pop();

    // Archives
    if (['.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.jar'].some(e => name.endsWith(e))) {
      return <FileArchive size={16} className="fm-icon-archive" />;
    }

    // Images
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg'].some(e => name.endsWith(e))) {
      return <FileImage size={16} className="fm-icon-image" />;
    }

    // Code files
    if (['.js', '.ts', '.jsx', '.tsx', '.java', '.py', '.php', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.cs', '.sh', '.bat'].some(e => name.endsWith(e))) {
      return <FileCode size={16} className="fm-icon-code" />;
    }

    // JSON/Config
    if (['.json', '.yaml', '.yml', '.toml', '.ini'].some(e => name.endsWith(e))) {
      return <FileJson size={16} className="fm-icon-json" />;
    }

    // Properties/Config files
    if (name.endsWith('.properties') || name.endsWith('.conf') || name.endsWith('.cfg')) {
      return <Settings size={16} className="fm-icon-config" />;
    }

    // Database
    if (['.db', '.sqlite', '.sql'].some(e => name.endsWith(e))) {
      return <Database size={16} className="fm-icon-database" />;
    }

    // Video
    if (['.mp4', '.avi', '.mkv', '.mov', '.webm'].some(e => name.endsWith(e))) {
      return <FileVideo size={16} className="fm-icon-video" />;
    }

    // Audio
    if (['.mp3', '.wav', '.ogg', '.flac', '.aac'].some(e => name.endsWith(e))) {
      return <FileAudio size={16} className="fm-icon-audio" />;
    }

    // Spreadsheet/Data
    if (['.csv', '.xls', '.xlsx'].some(e => name.endsWith(e))) {
      return <FileSpreadsheet size={16} className="fm-icon-spreadsheet" />;
    }

    // Text files
    if (['.txt', '.log', '.md', '.readme'].some(e => name.endsWith(e))) {
      return <FileText size={16} className="fm-icon-text" />;
    }

    // Default file icon
    return <File size={16} className="fm-icon-default" />;
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ArrowUpDown size={12} className="sort-icon-inactive" />;
    return sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div className="file-manager">
      {/* Toolbar */}
      <div className="fm-toolbar">
        <div className="fm-breadcrumb">
          <button className="btn btn-sm btn-secondary" onClick={() => setCurrentPath('')}>
            <Home size={16} /> Root
          </button>
          {currentPath && (
            <>
              <span>/</span>
              <button className="btn btn-sm btn-secondary" onClick={goUp}>
                <ChevronUp size={16} /> Su
              </button>
              <span>/</span>
              <span>{currentPath.split('/').pop()}</span>
            </>
          )}
        </div>

        <div className="fm-actions">
          <button className="btn btn-sm btn-primary" onClick={() => { setCreateType('directory'); setShowCreateModal(true); }}>
            <FolderPlus size={16} /> Nuova Cartella
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => { setCreateType('file'); setShowCreateModal(true); }}>
            <FilePlus size={16} /> Nuovo File
          </button>
          <label className="btn btn-sm btn-primary fm-upload-label">
            <Upload size={16} /> Upload File
            <input type="file" multiple onChange={uploadFiles} className="fm-upload-input" />
          </label>
          <label className="btn btn-sm btn-success fm-upload-label" title="Carica archivi ZIP o TAR per estrarli">
            <Archive size={16} /> Upload Archivio
            <input type="file" accept=".zip,.tar,.tar.gz,.tgz" onChange={uploadFiles} className="fm-upload-input" />
          </label>
          <button className="btn btn-sm btn-secondary" onClick={loadFiles}>
            <RefreshCw size={16} /> Ricarica
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="fm-search-bar">
        <Search size={16} className="fm-search-icon" />
        <input
          type="text"
          placeholder="Cerca file o cartelle..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="fm-search-input"
        />
        {searchQuery && (
          <button className="fm-search-clear" onClick={() => setSearchQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Upload Progress Bar */}
      {uploadProgress && (
        <div className="fm-upload-progress">
          <div className="fm-upload-progress-info">
            <span className="fm-upload-progress-filename">
              <Upload size={16} /> Caricamento: {uploadProgress.fileName}
            </span>
            <span className="fm-upload-progress-stats">
              {formatSize(uploadProgress.loaded)} / {formatSize(uploadProgress.total)} ({uploadProgress.percent}%)
            </span>
          </div>
          <div className="fm-upload-progress-bar-container">
            <div
              className="fm-upload-progress-bar"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
          <button className="btn btn-sm btn-danger" onClick={cancelUpload}>
            <X size={14} /> Annulla
          </button>
        </div>
      )}

      {/* Archive Job Progress */}
      {archiveJob && (
        <div className={`fm-archive-job fm-archive-job-${archiveJob.status}`}>
          <div className="fm-archive-job-info">
            <span className="fm-archive-job-icon">
              {archiveJob.status === 'running' ? (
                <Loader size={16} className="spin" />
              ) : archiveJob.status === 'completed' ? (
                <Check size={16} />
              ) : (
                <X size={16} />
              )}
            </span>
            <span className="fm-archive-job-message">
              {archiveJob.type === 'compress' ? 'Compressione' : 'Estrazione'}: {archiveJob.message || archiveJob.filename}
            </span>
          </div>
          {archiveJob.status !== 'running' && (
            <button className="btn btn-sm btn-secondary" onClick={() => setArchiveJob(null)}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div className="fm-container">
        {/* File List */}
        <div className="fm-file-list">
          {loading ? (
            <div className="fm-loading">Caricamento...</div>
          ) : files.length === 0 ? (
            <div className="fm-empty">
              Cartella vuota
            </div>
          ) : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th className="fm-sortable" onClick={() => handleSort('name')}>
                    <span className="fm-sortable-content">Nome <SortIcon column="name" /></span>
                  </th>
                  <th className="fm-sortable" onClick={() => handleSort('size')}>
                    <span className="fm-sortable-content">Dimensione <SortIcon column="size" /></span>
                  </th>
                  <th className="fm-sortable" onClick={() => handleSort('modified')}>
                    <span className="fm-sortable-content">Modificato <SortIcon column="modified" /></span>
                  </th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {getSortedFiles().map(file => (
                  <tr key={file.path} className={selectedFile?.path === file.path ? 'selected' : ''}>
                    <td onClick={() => openFile(file)} className="fm-file-cell">
                      <span className="fm-icon">
                        {getFileIcon(file)}
                      </span>
                      {file.name}
                    </td>
                    <td>{formatSize(file.size)}</td>
                    <td>{formatDate(file.modified)}</td>
                    <td>
                      <div className="fm-actions-cell">
                        {file.type === 'file' && (
                          <button className="btn-icon-small" onClick={() => downloadFile(file)} title="Download">
                            <Download size={14} />
                          </button>
                        )}
                        <button className="btn-icon-small" onClick={() => startRename(file)} title="Rinomina">
                          <Edit3 size={14} />
                        </button>
                        <button className="btn-icon-small" onClick={() => zipItem(file)} title="Comprimi">
                          <PackageOpen size={14} />
                        </button>
                        {(file.name.endsWith('.zip') || file.name.endsWith('.tar') || file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz')) && (
                          <button className="btn-icon-small" onClick={() => unzipItem(file)} title="Estrai">
                            <FolderOpen size={14} />
                          </button>
                        )}
                        <button className="btn-icon-small danger" onClick={() => deleteItem(file)} title="Elimina">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* File Viewer/Editor */}
        {selectedFile && (
          <div className="fm-file-viewer">
            <div className="fm-viewer-header">
              <h3>{selectedFile.name}</h3>
              <div className="fm-viewer-actions">
                {fileContent === null ? (
                  // Binary file - only show download button
                  <button className="btn btn-sm btn-primary" onClick={() => downloadFile(selectedFile)}>
                    <Download size={16} /> Download
                  </button>
                ) : editMode ? (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={saveFile}>
                      <Save size={16} /> Salva
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => {
                      setFileContent(originalFileContent); // Restore original content
                      setEditMode(false);
                    }}>
                      <X size={16} /> Annulla
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    setOriginalFileContent(fileContent); // Save original before editing
                    setEditMode(true);
                  }}>
                    <Edit3 size={16} /> Modifica
                  </button>
                )}
                {fileContent !== null && (
                  <>
                    <button
                      className={`btn btn-sm ${fileSearchVisible ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setFileSearchVisible(!fileSearchVisible); if (fileSearchVisible) { setFileSearch(''); } else { setCurrentMatchIndex(0); } }}
                      title="Cerca nel file (Ctrl+F)"
                    >
                      <Search size={16} />
                    </button>
                    <button
                      className={`btn btn-sm ${wordWrap ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setWordWrap(!wordWrap)}
                      title={wordWrap ? 'Disabilita Word Wrap' : 'Abilita Word Wrap'}
                    >
                      <WrapText size={16} />
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedFile(null); setEditMode(false); }} title="Chiudi">
                  <X size={16} />
                </button>
              </div>
            </div>
            {fileSearchVisible && fileContent !== null && (
              <div className="fm-file-search-bar">
                <Search size={14} className="fm-file-search-icon" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => { setFileSearch(e.target.value); setCurrentMatchIndex(0); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      navigateMatch(e.shiftKey ? -1 : 1);
                    }
                    if (e.key === 'Escape') {
                      setFileSearchVisible(false);
                      setFileSearch('');
                    }
                  }}
                  placeholder="Cerca nel file..."
                  className="fm-file-search-input"
                  autoFocus
                />
                {fileSearch && (
                  <span className="fm-file-search-count">
                    {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : 'Nessun risultato'}
                  </span>
                )}
                {totalMatches > 0 && (
                  <>
                    <button className="fm-file-search-nav" onClick={() => navigateMatch(-1)} title="Precedente (Shift+Enter)">
                      <ArrowUp size={14} />
                    </button>
                    <button className="fm-file-search-nav" onClick={() => navigateMatch(1)} title="Successivo (Enter)">
                      <ArrowDown size={14} />
                    </button>
                  </>
                )}
                <button className="fm-file-search-nav" onClick={() => { setFileSearchVisible(false); setFileSearch(''); }} title="Chiudi (Esc)">
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="fm-viewer-content">
              {fileContent === null ? (
                // Binary file message
                <div className="fm-binary-notice">
                  <PackageOpen size={48} />
                  <p>File binario</p>
                  <p className="fm-binary-hint">Questo tipo di file non può essere visualizzato come testo.</p>
                  <p className="fm-binary-hint">Dimensione: {formatSize(selectedFile.size)}</p>
                </div>
              ) : editMode ? (
                <div className={`fm-code-container ${wordWrap ? 'fm-wrap' : ''}`}>
                  <div className="fm-line-numbers" ref={lineNumbersRef}>
                    {fileContent.split('\n').map((_, i) => (
                      <div key={i} className="fm-line-number">{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    ref={editorRef}
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    onScroll={(e) => {
                      if (lineNumbersRef.current) {
                        lineNumbersRef.current.scrollTop = e.target.scrollTop;
                      }
                    }}
                    className="fm-editor"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div className={`fm-code-container ${wordWrap ? 'fm-wrap' : ''}`}>
                  <div className="fm-line-numbers">
                    {fileContent.split('\n').map((_, i) => (
                      <div key={i} className="fm-line-number">{i + 1}</div>
                    ))}
                  </div>
                  <pre className="fm-preview" ref={previewRef}>
                    {fileSearch && fileSearchVisible ? renderHighlightedContent(fileContent) : fileContent}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Crea {createType === 'file' ? 'File' : 'Cartella'}</h2>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Nome"
              className="input"
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={createItem}>
                Crea
              </button>
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="modal-overlay" onClick={() => setShowRenameModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Rinomina</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nuovo nome"
              className="input"
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={renameItem}>
                Rinomina
              </button>
              <button className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

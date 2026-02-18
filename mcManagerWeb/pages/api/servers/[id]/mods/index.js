const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { createWriteStream } = require('fs');
const { getModVersions, getDownloadUrl, MOD_FOLDER_MAP, LOADER_MAP } = require('../../../../../lib/mods-api');
const { readConfig, SERVERS_DIR } = require('../../../../../lib/docker-server-manager');

// Get the mods metadata file path for a server (inside minecraft-server subdirectory)
function getMetadataPath(serverId) {
  return path.join(SERVERS_DIR, serverId, 'minecraft-server', 'mods-metadata.json');
}

// Read mods metadata
async function readModsMetadata(serverId) {
  try {
    const data = await fs.readFile(getMetadataPath(serverId), 'utf8');
    return JSON.parse(data);
  } catch {
    return { mods: [] };
  }
}

// Save mods metadata
async function saveModsMetadata(serverId, metadata) {
  await fs.writeFile(getMetadataPath(serverId), JSON.stringify(metadata, null, 2));
}

// Get mod folder path for a server (inside minecraft-server subdirectory)
async function getModFolder(serverId, serverType) {
  const folderName = MOD_FOLDER_MAP[serverType] || 'mods';
  const modFolder = path.join(SERVERS_DIR, serverId, 'minecraft-server', folderName);

  // Ensure the folder exists
  await fs.mkdir(modFolder, { recursive: true });

  return modFolder;
}

// Get server config by ID
async function getServerConfig(serverId) {
  const config = await readConfig();
  return config.find(s => s.id === serverId);
}

export default async function handler(req, res) {
  const { id: serverId } = req.query;

  // Verify server exists
  const serverConfig = await getServerConfig(serverId);
  if (!serverConfig) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const serverType = serverConfig.serverType || 'paper';

  if (req.method === 'GET') {
    // GET: List installed mods
    try {
      const metadata = await readModsMetadata(serverId);
      const modFolder = await getModFolder(serverId, serverType);

      // Get actual files in mod folder
      let files = [];
      try {
        files = await fs.readdir(modFolder);
      } catch {
        // Folder doesn't exist yet
      }

      // Filter for jar files
      const jarFiles = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));

      // Merge metadata with actual files
      const installedMods = metadata.mods.map(mod => {
        const fileExists = jarFiles.includes(mod.fileName) || jarFiles.includes(mod.fileName + '.disabled');
        const isDisabled = jarFiles.includes(mod.fileName + '.disabled');
        return {
          ...mod,
          exists: fileExists,
          enabled: !isDisabled
        };
      });

      // Find orphan files (jars without metadata)
      const trackedFiles = metadata.mods.map(m => m.fileName);
      const orphanFiles = jarFiles
        .filter(f => !trackedFiles.includes(f) && !trackedFiles.includes(f.replace('.disabled', '')))
        .map(f => ({
          fileName: f,
          name: f.replace('.jar', '').replace('.disabled', ''),
          orphan: true,
          enabled: !f.endsWith('.disabled')
        }));

      res.status(200).json({
        mods: [...installedMods, ...orphanFiles],
        serverType,
        loaders: LOADER_MAP[serverType] || [],
        modFolder: MOD_FOLDER_MAP[serverType] || 'mods'
      });
    } catch (error) {
      console.error('Error listing mods:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'POST') {
    // POST: Install a mod
    try {
      const { source, projectId, versionId, name, slug } = req.body;

      if (!source || !projectId || !versionId) {
        return res.status(400).json({ error: 'Missing required fields: source, projectId, versionId' });
      }

      // Get versions filtered by server loader and game version
      const loaders = LOADER_MAP[serverType] || [];
      const versions = await getModVersions(source, projectId, {
        loaders,
        gameVersion: serverConfig.minecraftVersion
      });

      // Resolve the actual version to install
      let resolvedVersionId = versionId;
      let version = null;

      if (versionId === 'latest') {
        // Find the first version compatible with the server's loader
        if (loaders.length > 0 && versions.length > 0) {
          // For CurseForge, filter by loader since the API doesn't do it
          const compatible = versions.find(v =>
            v.loaders?.length === 0 || v.loaders?.some(l => loaders.includes(l.toLowerCase()))
          );
          version = compatible || versions[0];
        } else {
          version = versions[0];
        }

        if (!version) {
          return res.status(400).json({ error: `Nessuna versione compatibile trovata per ${serverType} ${serverConfig.minecraftVersion}` });
        }
        resolvedVersionId = version.id;
      } else {
        version = versions.find(v => v.id === versionId);
      }

      // Get download info using the resolved version ID
      const downloadInfo = await getDownloadUrl(source, projectId, resolvedVersionId);

      if (!downloadInfo.url) {
        return res.status(400).json({ error: 'Could not get download URL for this mod' });
      }

      const fileName = version?.fileName || downloadInfo.fileName || `${slug || projectId}-${resolvedVersionId}.jar`;
      const versionNumber = version?.versionNumber || resolvedVersionId;

      // Download the file
      const modFolder = await getModFolder(serverId, serverType);
      const filePath = path.join(modFolder, fileName);

      const response = await fetch(downloadInfo.url);
      if (!response.ok) {
        throw new Error(`Failed to download mod: ${response.status}`);
      }

      // Save the file
      const fileStream = createWriteStream(filePath);
      await pipeline(Readable.fromWeb(response.body), fileStream);

      // Update metadata
      const metadata = await readModsMetadata(serverId);

      // Remove existing entry for this mod if present
      metadata.mods = metadata.mods.filter(m =>
        !(m.source === source && m.projectId === projectId)
      );

      // Add new entry
      metadata.mods.push({
        id: `${source}:${projectId}`,
        projectId,
        name: name || slug || projectId,
        slug,
        source,
        installedVersion: versionNumber,
        versionId: resolvedVersionId,
        fileName,
        installedAt: new Date().toISOString()
      });

      await saveModsMetadata(serverId, metadata);

      res.status(201).json({
        success: true,
        mod: metadata.mods.find(m => m.projectId === projectId)
      });
    } catch (error) {
      console.error('Error installing mod:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

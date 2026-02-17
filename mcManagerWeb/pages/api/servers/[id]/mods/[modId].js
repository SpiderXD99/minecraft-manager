const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { createWriteStream } = require('fs');
const { getModVersions, getDownloadUrl, MOD_FOLDER_MAP, LOADER_MAP } = require('../../../../../lib/mods-api');
const { readConfig, SERVERS_DIR } = require('../../../../../lib/docker-server-manager');

function getMetadataPath(serverId) {
  return path.join(SERVERS_DIR, serverId, 'minecraft-server', 'mods-metadata.json');
}

async function readModsMetadata(serverId) {
  try {
    const data = await fs.readFile(getMetadataPath(serverId), 'utf8');
    return JSON.parse(data);
  } catch {
    return { mods: [] };
  }
}

async function saveModsMetadata(serverId, metadata) {
  await fs.writeFile(getMetadataPath(serverId), JSON.stringify(metadata, null, 2));
}

async function getModFolder(serverId, serverType) {
  const folderName = MOD_FOLDER_MAP[serverType] || 'mods';
  return path.join(SERVERS_DIR, serverId, 'minecraft-server', folderName);
}

async function getServerConfig(serverId) {
  const config = await readConfig();
  return config.find(s => s.id === serverId);
}

export default async function handler(req, res) {
  const { id: serverId, modId } = req.query;

  // Verify server exists
  const serverConfig = await getServerConfig(serverId);
  if (!serverConfig) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const serverType = serverConfig.serverType || 'paper';
  const modFolder = await getModFolder(serverId, serverType);

  // Decode modId (format: source:projectId)
  const decodedModId = decodeURIComponent(modId);

  if (req.method === 'DELETE') {
    // DELETE: Remove a mod
    try {
      const metadata = await readModsMetadata(serverId);
      const modIndex = metadata.mods.findIndex(m => m.id === decodedModId);

      if (modIndex === -1) {
        // Try to find by fileName for orphan mods
        const { fileName } = req.query;
        if (fileName) {
          const filePath = path.join(modFolder, fileName);
          try {
            await fs.unlink(filePath);
            return res.status(200).json({ success: true, message: 'Mod file deleted' });
          } catch (error) {
            return res.status(404).json({ error: 'Mod file not found' });
          }
        }
        return res.status(404).json({ error: 'Mod not found in metadata' });
      }

      const mod = metadata.mods[modIndex];

      // Delete the file
      const filePath = path.join(modFolder, mod.fileName);
      const disabledPath = filePath + '.disabled';

      try {
        await fs.unlink(filePath);
      } catch {
        // Try disabled version
        try {
          await fs.unlink(disabledPath);
        } catch {
          // File already gone, that's fine
        }
      }

      // Remove from metadata
      metadata.mods.splice(modIndex, 1);
      await saveModsMetadata(serverId, metadata);

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error removing mod:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'PATCH') {
    // PATCH: Enable/disable or update a mod
    try {
      const { action, versionId } = req.body;

      const metadata = await readModsMetadata(serverId);
      const mod = metadata.mods.find(m => m.id === decodedModId);

      if (!mod && action !== 'toggle') {
        return res.status(404).json({ error: 'Mod not found' });
      }

      if (action === 'toggle') {
        // Toggle enable/disable
        const fileName = mod?.fileName || req.body.fileName;
        if (!fileName) {
          return res.status(400).json({ error: 'fileName required for toggle' });
        }

        const enabledPath = path.join(modFolder, fileName.replace('.disabled', ''));
        const disabledPath = enabledPath + '.disabled';

        try {
          await fs.access(enabledPath);
          // File is enabled, disable it
          await fs.rename(enabledPath, disabledPath);
          res.status(200).json({ success: true, enabled: false });
        } catch {
          // File might be disabled, enable it
          try {
            await fs.access(disabledPath);
            await fs.rename(disabledPath, enabledPath);
            res.status(200).json({ success: true, enabled: true });
          } catch {
            res.status(404).json({ error: 'Mod file not found' });
          }
        }
      } else if (action === 'update' && versionId) {
        // Update to new version
        const downloadInfo = await getDownloadUrl(mod.source, mod.projectId, versionId);

        if (!downloadInfo.url) {
          return res.status(400).json({ error: 'Could not get download URL' });
        }

        // Get version info
        const versions = await getModVersions(mod.source, mod.projectId, {
          loaders: LOADER_MAP[serverType] || [],
          gameVersion: serverConfig.minecraftVersion
        });

        const version = versions.find(v => v.id === versionId);
        const newFileName = version?.fileName || `${mod.slug || mod.projectId}-${versionId}.jar`;

        // Delete old file
        const oldPath = path.join(modFolder, mod.fileName);
        try {
          await fs.unlink(oldPath);
        } catch {
          // Old file might not exist
        }

        // Download new file
        const newPath = path.join(modFolder, newFileName);
        const response = await fetch(downloadInfo.url);
        if (!response.ok) {
          throw new Error(`Failed to download: ${response.status}`);
        }

        const fileStream = createWriteStream(newPath);
        await pipeline(Readable.fromWeb(response.body), fileStream);

        // Update metadata
        mod.installedVersion = version?.versionNumber || versionId;
        mod.versionId = versionId;
        mod.fileName = newFileName;
        mod.updatedAt = new Date().toISOString();

        await saveModsMetadata(serverId, metadata);

        res.status(200).json({ success: true, mod });
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error) {
      console.error('Error updating mod:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

const fs = require('fs').promises;
const path = require('path');
const { getModVersions, LOADER_MAP } = require('../../../../../lib/mods-api');
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

async function getServerConfig(serverId) {
  const config = await readConfig();
  return config.find(s => s.id === serverId);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: serverId } = req.query;

  // Verify server exists
  const serverConfig = await getServerConfig(serverId);
  if (!serverConfig) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const serverType = serverConfig.serverType || 'paper';
  const gameVersion = serverConfig.minecraftVersion;
  const loaders = LOADER_MAP[serverType] || [];

  try {
    const metadata = await readModsMetadata(serverId);
    const updates = [];

    // Check each installed mod for updates
    for (const mod of metadata.mods) {
      try {
        const versions = await getModVersions(mod.source, mod.projectId, {
          loaders,
          gameVersion
        });

        if (versions.length > 0) {
          const latestVersion = versions[0];

          // Compare versions - simple string comparison for now
          // In real world, would need semver comparison
          if (latestVersion.versionNumber !== mod.installedVersion &&
              latestVersion.id !== mod.versionId) {
            updates.push({
              ...mod,
              latestVersion: latestVersion.versionNumber,
              latestVersionId: latestVersion.id,
              latestFileName: latestVersion.fileName,
              datePublished: latestVersion.datePublished
            });
          }
        }
      } catch (error) {
        console.error(`Error checking updates for ${mod.name}:`, error.message);
        // Continue with other mods
      }
    }

    res.status(200).json({
      updates,
      totalInstalled: metadata.mods.length,
      updatesAvailable: updates.length
    });
  } catch (error) {
    console.error('Error checking updates:', error);
    res.status(500).json({ error: error.message });
  }
}

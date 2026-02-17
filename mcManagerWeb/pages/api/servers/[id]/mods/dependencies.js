const fs = require('fs').promises;
const path = require('path');
const { getDependencies, getLatestVersion, LOADER_MAP } = require('../../../../../lib/mods-api');
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: serverId } = req.query;
  const { source, projectId, versionId } = req.body;

  if (!source || !projectId || !versionId) {
    return res.status(400).json({ error: 'Missing required fields: source, projectId, versionId' });
  }

  // Verify server exists
  const serverConfig = await getServerConfig(serverId);
  if (!serverConfig) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const serverType = serverConfig.serverType || 'paper';
  const gameVersion = serverConfig.minecraftVersion;
  const loaders = LOADER_MAP[serverType] || [];

  try {
    // Get dependencies for the mod version
    const dependencies = await getDependencies(source, projectId, versionId);

    // Get currently installed mods
    const metadata = await readModsMetadata(serverId);
    const installedProjectIds = new Set(metadata.mods.map(m => m.projectId));

    // Check which dependencies are missing
    const missingDependencies = [];

    for (const dep of dependencies) {
      // Check if this dependency is already installed
      if (installedProjectIds.has(dep.projectId)) {
        continue;
      }

      // Get the latest compatible version for this dependency
      try {
        const latestVersion = await getLatestVersion(dep.source, dep.projectId, {
          loaders,
          gameVersion
        });

        if (latestVersion) {
          missingDependencies.push({
            ...dep,
            latestVersionId: latestVersion.id,
            latestVersionNumber: latestVersion.versionNumber,
            latestFileName: latestVersion.fileName
          });
        } else {
          // No compatible version found, still report the dependency
          missingDependencies.push({
            ...dep,
            latestVersionId: null,
            latestVersionNumber: null,
            latestFileName: null,
            noCompatibleVersion: true
          });
        }
      } catch (error) {
        console.error(`Error fetching version for dependency ${dep.name}:`, error.message);
        missingDependencies.push({
          ...dep,
          latestVersionId: null,
          latestVersionNumber: null,
          latestFileName: null,
          error: error.message
        });
      }
    }

    res.status(200).json({
      dependencies: missingDependencies,
      totalDependencies: dependencies.length,
      missingCount: missingDependencies.length
    });
  } catch (error) {
    console.error('Error checking dependencies:', error);
    res.status(500).json({ error: error.message });
  }
}

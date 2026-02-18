// Mods API Client for Modrinth and CurseForge
// Modrinth: No API key needed, 300 req/min limit
// CurseForge: Requires API key (via Docker secret or env variable)

const fs = require('fs');

const MODRINTH_API = 'https://api.modrinth.com/v2';
const CURSEFORGE_API = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432; // CurseForge game ID for Minecraft

// Read CurseForge API key from Docker secret or env variable
function getCurseforgeApiKey() {
  // Try Docker secret first (no $ escaping needed)
  try {
    const key = fs.readFileSync('/run/secrets/curseforge_api_key', 'utf-8').trim();
    if (key) return key;
  } catch {}
  // Fall back to environment variable
  return process.env.CURSEFORGE_API_KEY || null;
}

// Loader mappings for different server types
const LOADER_MAP = {
  'fabric': ['fabric'],
  'forge': ['forge', 'neoforge'],
  'paper': ['paper', 'spigot', 'bukkit'],
  'spigot': ['spigot', 'bukkit'],
  'purpur': ['paper', 'spigot', 'bukkit'],
  'velocity': ['velocity'],
  'waterfall': ['waterfall', 'bungeecord'],
  'vanilla': []
};

// Mod folder mapping for different server types
const MOD_FOLDER_MAP = {
  'fabric': 'mods',
  'forge': 'mods',
  'paper': 'plugins',
  'spigot': 'plugins',
  'purpur': 'plugins',
  'velocity': 'plugins',
  'waterfall': 'plugins',
  'vanilla': 'mods'
};

// CurseForge class IDs
const CF_CLASS_MODS = 6;
const CF_CLASS_PLUGINS = 5;
const CF_CLASS_MODPACKS = 4471;

// User-Agent for Modrinth
const USER_AGENT = 'MCManager/1.0.0 (github.com/minecraft-manager)';

// Modrinth API functions
async function modrinthFetch(endpoint, options = {}) {
  const response = await fetch(`${MODRINTH_API}${endpoint}`, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Modrinth API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// CurseForge API functions
async function curseforgeFetch(endpoint, options = {}) {
  const apiKey = getCurseforgeApiKey();

  if (!apiKey) {
    throw new Error('CurseForge API key not configured. Set CURSEFORGE_API_KEY environment variable.');
  }

  const response = await fetch(`${CURSEFORGE_API}${endpoint}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`CurseForge API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Search mods on Modrinth
async function searchModrinth(query, options = {}) {
  const { loaders = [], gameVersion = '', limit = 20, offset = 0, projectType = 'mod' } = options;

  const facets = [];

  // Project type (mod or plugin)
  facets.push([`project_type:${projectType}`]);

  // Loaders filter
  if (loaders.length > 0) {
    facets.push(loaders.map(l => `categories:${l}`));
  }

  // Game version filter (skip "latest" - not a real version on Modrinth)
  if (gameVersion && gameVersion !== 'latest') {
    facets.push([`versions:${gameVersion}`]);
  }

  const params = new URLSearchParams({
    query,
    limit: limit.toString(),
    offset: offset.toString(),
    facets: JSON.stringify(facets)
  });

  const data = await modrinthFetch(`/search?${params}`);

  return {
    mods: data.hits.map(hit => ({
      id: hit.project_id,
      slug: hit.slug,
      name: hit.title,
      description: hit.description,
      author: hit.author,
      downloads: hit.downloads,
      icon: hit.icon_url,
      categories: hit.categories,
      gameVersions: hit.versions,
      source: 'modrinth'
    })),
    total: data.total_hits,
    limit: data.limit,
    offset: data.offset
  };
}

// Search mods on CurseForge
async function searchCurseforge(query, options = {}) {
  const { loaders = [], gameVersion = '', limit = 20, offset = 0, projectType = 'mod' } = options;

  // Determine class ID based on project type
  const classId = projectType === 'modpack' ? CF_CLASS_MODPACKS : (projectType === 'plugin' ? CF_CLASS_PLUGINS : CF_CLASS_MODS);

  const params = new URLSearchParams({
    gameId: MINECRAFT_GAME_ID.toString(),
    classId: classId.toString(),
    searchFilter: query,
    pageSize: limit.toString(),
    index: offset.toString(),
    sortField: 2, // Popularity
    sortOrder: 'desc'
  });

  // Add game version filter (skip "latest" - not a real version on CurseForge)
  if (gameVersion && gameVersion !== 'latest') {
    params.append('gameVersion', gameVersion);
  }

  // Add mod loader filter (CurseForge uses modLoaderType)
  // 1 = Forge, 4 = Fabric, 5 = Quilt, 6 = NeoForge
  if (loaders.length > 0) {
    const loaderTypeMap = {
      'forge': 1,
      'fabric': 4,
      'quilt': 5,
      'neoforge': 6
    };
    const loaderType = loaderTypeMap[loaders[0]];
    if (loaderType) {
      params.append('modLoaderType', loaderType.toString());
    }
  }

  const data = await curseforgeFetch(`/mods/search?${params}`);

  return {
    mods: data.data.map(mod => ({
      id: mod.id.toString(),
      slug: mod.slug,
      name: mod.name,
      description: mod.summary,
      author: mod.authors?.[0]?.name || 'Unknown',
      downloads: mod.downloadCount,
      icon: mod.logo?.thumbnailUrl || null,
      categories: mod.categories?.map(c => c.name) || [],
      gameVersions: mod.latestFilesIndexes?.map(f => f.gameVersion) || [],
      source: 'curseforge'
    })),
    total: data.pagination?.totalCount || data.data.length,
    limit,
    offset
  };
}

// Get mod details from Modrinth
async function getModrinthProject(projectId) {
  const data = await modrinthFetch(`/project/${projectId}`);

  return {
    id: data.id,
    slug: data.slug,
    name: data.title,
    description: data.description,
    body: data.body,
    author: data.team,
    downloads: data.downloads,
    icon: data.icon_url,
    categories: data.categories,
    gameVersions: data.game_versions,
    loaders: data.loaders,
    source: 'modrinth'
  };
}

// Get mod details from CurseForge
async function getCurseforgeProject(projectId) {
  const data = await curseforgeFetch(`/mods/${projectId}`);
  const mod = data.data;

  return {
    id: mod.id.toString(),
    slug: mod.slug,
    name: mod.name,
    description: mod.summary,
    author: mod.authors?.[0]?.name || 'Unknown',
    downloads: mod.downloadCount,
    icon: mod.logo?.thumbnailUrl || null,
    categories: mod.categories?.map(c => c.name) || [],
    source: 'curseforge'
  };
}

// Get versions for a Modrinth project
async function getModrinthVersions(projectId, options = {}) {
  const { loaders = [], gameVersion = '' } = options;

  const params = new URLSearchParams();

  if (loaders.length > 0) {
    params.append('loaders', JSON.stringify(loaders));
  }

  if (gameVersion && gameVersion !== 'latest') {
    params.append('game_versions', JSON.stringify([gameVersion]));
  }

  const endpoint = `/project/${projectId}/version${params.toString() ? '?' + params : ''}`;
  const data = await modrinthFetch(endpoint);

  return data.map(version => ({
    id: version.id,
    name: version.name,
    versionNumber: version.version_number,
    gameVersions: version.game_versions,
    loaders: version.loaders,
    downloadUrl: version.files?.[0]?.url || null,
    fileName: version.files?.[0]?.filename || null,
    fileSize: version.files?.[0]?.size || 0,
    datePublished: version.date_published,
    source: 'modrinth'
  }));
}

// CurseForge modLoaderType enum
const CF_LOADER_TYPE = {
  'forge': 1,
  'cauldron': 2,
  'liteloader': 3,
  'fabric': 4,
  'quilt': 5,
  'neoforge': 6
};

// Get versions for a CurseForge project
async function getCurseforgeVersions(projectId, options = {}) {
  const { gameVersion = '', loaders = [] } = options;

  const params = new URLSearchParams();

  if (gameVersion && gameVersion !== 'latest') {
    params.append('gameVersion', gameVersion);
  }

  // CurseForge supports filtering by modLoaderType
  if (loaders.length > 0) {
    const loaderTypeId = CF_LOADER_TYPE[loaders[0].toLowerCase()];
    if (loaderTypeId) {
      params.append('modLoaderType', loaderTypeId);
    }
  }

  const data = await curseforgeFetch(`/mods/${projectId}/files?${params}`);

  return data.data.map(file => ({
    id: file.id.toString(),
    name: file.displayName,
    versionNumber: file.displayName,
    gameVersions: file.gameVersions || [],
    loaders: file.gameVersions?.filter(v => ['Forge', 'Fabric', 'NeoForge', 'Quilt'].includes(v)) || [],
    downloadUrl: file.downloadUrl,
    fileName: file.fileName,
    fileSize: file.fileLength,
    datePublished: file.fileDate,
    source: 'curseforge'
  }));
}

// Get download URL for a specific version
async function getDownloadUrl(source, projectId, versionId) {
  if (source === 'modrinth') {
    const data = await modrinthFetch(`/version/${versionId}`);
    const primaryFile = data.files?.find(f => f.primary) || data.files?.[0];
    return {
      url: primaryFile?.url,
      fileName: primaryFile?.filename,
      fileSize: primaryFile?.size
    };
  } else if (source === 'curseforge') {
    const data = await curseforgeFetch(`/mods/${projectId}/files/${versionId}/download-url`);
    return {
      url: data.data,
      fileName: null, // Will be extracted from URL or version info
      fileSize: null
    };
  }

  throw new Error(`Unknown source: ${source}`);
}

// Unified search function
async function searchMods(query, options = {}) {
  const { source = 'both', ...searchOptions } = options;

  const results = { mods: [], total: 0 };

  try {
    if (source === 'modrinth' || source === 'both') {
      const modrinthResults = await searchModrinth(query, searchOptions);
      results.mods.push(...modrinthResults.mods);
      results.total += modrinthResults.total;
    }
  } catch (error) {
    console.error('Modrinth search error:', error.message);
  }

  try {
    if (source === 'curseforge' || source === 'both') {
      const curseforgeResults = await searchCurseforge(query, searchOptions);
      results.mods.push(...curseforgeResults.mods);
      results.total += curseforgeResults.total;
    }
  } catch (error) {
    console.error('CurseForge search error:', error.message);
  }

  // Sort by downloads if both sources were used
  if (source === 'both') {
    results.mods.sort((a, b) => b.downloads - a.downloads);
  }

  return results;
}

// Get versions for a mod
async function getModVersions(source, projectId, options = {}) {
  if (source === 'modrinth') {
    return getModrinthVersions(projectId, options);
  } else if (source === 'curseforge') {
    return getCurseforgeVersions(projectId, options);
  }

  throw new Error(`Unknown source: ${source}`);
}

// Get mod details
async function getModDetails(source, projectId) {
  if (source === 'modrinth') {
    return getModrinthProject(projectId);
  } else if (source === 'curseforge') {
    return getCurseforgeProject(projectId);
  }

  throw new Error(`Unknown source: ${source}`);
}

// Check if CurseForge API is configured
function isCurseforgeConfigured() {
  return !!getCurseforgeApiKey();
}

// Get dependencies for a Modrinth version
async function getModrinthDependencies(versionId) {
  const data = await modrinthFetch(`/version/${versionId}`);

  const dependencies = [];

  for (const dep of data.dependencies || []) {
    // Only process required dependencies
    if (dep.dependency_type !== 'required') continue;

    try {
      // Get project info for the dependency
      const projectData = await modrinthFetch(`/project/${dep.project_id}`);

      dependencies.push({
        projectId: dep.project_id,
        versionId: dep.version_id, // Can be null, meaning "any compatible version"
        name: projectData.title,
        slug: projectData.slug,
        icon: projectData.icon_url,
        description: projectData.description,
        type: dep.dependency_type,
        source: 'modrinth'
      });
    } catch (error) {
      console.error(`Error fetching dependency ${dep.project_id}:`, error.message);
    }
  }

  return dependencies;
}

// Get dependencies for a CurseForge file (version)
async function getCurseforgeDependencies(projectId, fileId) {
  const data = await curseforgeFetch(`/mods/${projectId}/files/${fileId}`);
  const file = data.data;

  const dependencies = [];

  for (const dep of file.dependencies || []) {
    // relationType 3 = required
    if (dep.relationType !== 3) continue;

    try {
      // Get mod info for the dependency
      const modData = await curseforgeFetch(`/mods/${dep.modId}`);
      const mod = modData.data;

      dependencies.push({
        projectId: dep.modId.toString(),
        versionId: null, // CurseForge doesn't specify exact version in dependencies
        name: mod.name,
        slug: mod.slug,
        icon: mod.logo?.thumbnailUrl || null,
        description: mod.summary,
        type: 'required',
        source: 'curseforge'
      });
    } catch (error) {
      console.error(`Error fetching dependency ${dep.modId}:`, error.message);
    }
  }

  return dependencies;
}

// Unified function to get dependencies for a mod version
async function getDependencies(source, projectId, versionId) {
  if (source === 'modrinth') {
    return getModrinthDependencies(versionId);
  } else if (source === 'curseforge') {
    return getCurseforgeDependencies(projectId, versionId);
  }

  throw new Error(`Unknown source: ${source}`);
}

// Get the latest compatible version for a dependency
async function getLatestVersion(source, projectId, options = {}) {
  const versions = await getModVersions(source, projectId, options);
  return versions.length > 0 ? versions[0] : null;
}

module.exports = {
  LOADER_MAP,
  MOD_FOLDER_MAP,
  searchModrinth,
  searchCurseforge,
  getModrinthProject,
  getCurseforgeProject,
  getModrinthVersions,
  getCurseforgeVersions,
  getDownloadUrl,
  searchMods,
  getModVersions,
  getModDetails,
  isCurseforgeConfigured,
  getDependencies,
  getLatestVersion
};

const { searchMods, isCurseforgeConfigured } = require('../../../lib/mods-api');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      q: query = '',
      source = 'both',
      loaders = '',
      gameVersion = '',
      projectType = 'mod',
      limit = '20',
      offset = '0'
    } = req.query;

    if (!query.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    // Parse loaders from comma-separated string
    const loadersArray = loaders ? loaders.split(',').map(l => l.trim()).filter(Boolean) : [];

    // Determine which sources to use
    let effectiveSource = source;
    if (source === 'both' || source === 'curseforge') {
      if (!isCurseforgeConfigured()) {
        if (source === 'curseforge') {
          return res.status(400).json({
            error: 'CurseForge API key not configured',
            message: 'Set CURSEFORGE_API_KEY environment variable to use CurseForge'
          });
        }
        // Fall back to modrinth only if both was requested
        effectiveSource = 'modrinth';
      }
    }

    const results = await searchMods(query, {
      source: effectiveSource,
      loaders: loadersArray,
      gameVersion,
      projectType,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });

    res.status(200).json({
      ...results,
      curseforgeAvailable: isCurseforgeConfigured()
    });
  } catch (error) {
    console.error('Mods search error:', error);
    res.status(500).json({ error: error.message });
  }
}

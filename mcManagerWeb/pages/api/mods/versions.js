const { getModVersions } = require('../../../lib/mods-api');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { source, projectId, loaders, gameVersion } = req.query;

  if (!source || !projectId) {
    return res.status(400).json({ error: 'Missing required parameters: source, projectId' });
  }

  try {
    const options = {};

    if (loaders) {
      options.loaders = loaders.split(',').filter(Boolean);
    }

    if (gameVersion) {
      options.gameVersion = gameVersion;
    }

    const versions = await getModVersions(source, projectId, options);

    res.status(200).json({
      versions,
      total: versions.length
    });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: error.message });
  }
}

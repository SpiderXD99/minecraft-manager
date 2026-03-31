const MOJANG_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 ora

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = Date.now();
    if (!cache || now - cacheTime > CACHE_TTL) {
      const response = await fetch(MOJANG_MANIFEST);
      if (!response.ok) throw new Error('Failed to fetch Mojang version manifest');
      const data = await response.json();
      cache = data.versions
        .filter(v => v.type === 'release')
        .map(v => v.id);
      cacheTime = now;
    }

    res.status(200).json({ versions: cache });
  } catch (error) {
    // Fallback con versioni comuni se Mojang non è raggiungibile
    res.status(200).json({
      versions: [
        '1.21.4', '1.21.3', '1.21.1', '1.21',
        '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20',
        '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
        '1.18.2', '1.18.1', '1.18',
        '1.17.1', '1.17',
        '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
        '1.15.2', '1.15.1', '1.15',
        '1.12.2', '1.8.9'
      ],
      fallback: true
    });
  }
}

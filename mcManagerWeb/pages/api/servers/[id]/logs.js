const { getServerLogs } = require('../../../../lib/docker-server-manager');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, lines } = req.query;

  try {
    const logs = await getServerLogs(id, lines ? parseInt(lines) : 500);
    res.status(200).json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

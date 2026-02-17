const { killServer } = require('../../../../lib/docker-server-manager');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  try {
    await killServer(id);
    res.status(200).json({ success: true, message: 'Server killato forzatamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

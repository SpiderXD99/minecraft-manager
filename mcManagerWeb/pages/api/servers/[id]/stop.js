const { stopServer } = require('../../../../lib/docker-server-manager');
const { getIO } = require('../../../../lib/socket');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  try {
    await stopServer(id);

    res.status(200).json({ success: true, message: 'Comando stop inviato' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

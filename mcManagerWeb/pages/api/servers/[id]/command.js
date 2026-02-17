const { sendCommand } = require('../../../../lib/docker-server-manager');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { command } = req.body;

  try {
    await sendCommand(id, command);
    res.status(200).json({ success: true, message: 'Comando inviato' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

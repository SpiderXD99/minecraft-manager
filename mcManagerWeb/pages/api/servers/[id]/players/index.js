const fs = require('fs').promises;
const path = require('path');
const { readConfig, sendCommand, isServerRunning, getServerLogs, SERVERS_DIR } = require('../../../../../lib/docker-server-manager');

// UUID without dashes to with dashes
function formatUUID(uuid) {
  if (uuid.includes('-')) return uuid;
  return `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
}

// UUID with dashes to without
function stripUUID(uuid) {
  return uuid.replace(/-/g, '');
}

// Read usercache.json for UUID -> name mapping
async function readUserCache(serverId) {
  try {
    const cachePath = path.join(SERVERS_DIR, serverId, 'minecraft-server', 'usercache.json');
    const data = await fs.readFile(cachePath, 'utf8');
    const entries = JSON.parse(data);
    const map = {};
    for (const entry of entries) {
      const uuid = entry.uuid?.toLowerCase();
      if (uuid) {
        map[stripUUID(uuid)] = entry.name;
      }
    }
    return map;
  } catch {
    return {};
  }
}

// Resolve player name from Mojang API (fallback)
async function resolveNameFromMojang(uuid) {
  try {
    const cleanUuid = stripUUID(uuid);
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`);
    if (res.ok) {
      const data = await res.json();
      return data.name || null;
    }
  } catch {}
  return null;
}

// Find the world directory (could be 'world', 'world_the_overworld', etc.)
async function findWorldDir(serverId) {
  const serverDir = path.join(SERVERS_DIR, serverId, 'minecraft-server');

  // Common world directory names
  const candidates = ['world', 'world_the_overworld'];

  for (const name of candidates) {
    const playerDataDir = path.join(serverDir, name, 'playerdata');
    try {
      await fs.access(playerDataDir);
      return name;
    } catch {}
  }

  // Try to find any directory with playerdata
  try {
    const entries = await fs.readdir(serverDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const playerDataDir = path.join(serverDir, entry.name, 'playerdata');
        try {
          await fs.access(playerDataDir);
          return entry.name;
        } catch {}
      }
    }
  } catch {}

  return 'world'; // default
}

// Get online players by parsing server logs after sending /list
async function getOnlinePlayers(serverId) {
  try {
    const running = await isServerRunning(serverId);
    if (!running) return { online: [], count: 0, max: 0 };

    // Send list command
    await sendCommand(serverId, 'list');

    // Wait for the response to appear in logs
    await new Promise(resolve => setTimeout(resolve, 500));

    // Read recent logs
    const logs = await getServerLogs(serverId, 30);

    // Find the most recent "There are X/Y players online:" line
    // Formats vary: "There are X of a max of Y players online:" or "There are X/Y players online:"
    for (let i = logs.length - 1; i >= 0; i--) {
      const line = logs[i];

      // Match various formats
      const match = line.match(/There are (\d+) (?:of a max of )?(\d+)?\/?(\d+)? players? online[:\s]*(.*)?/i)
        || line.match(/There are (\d+)\/(\d+) players online[:\s]*(.*)?/i);

      if (match) {
        const count = parseInt(match[1]) || 0;
        const max = parseInt(match[2] || match[3]) || 20;
        const playerListStr = (match[4] || match[3] || '').trim();

        const online = playerListStr
          ? playerListStr.split(',').map(n => n.trim()).filter(n => n.length > 0)
          : [];

        return { online, count, max };
      }
    }
  } catch (error) {
    console.error('Error getting online players:', error.message);
  }

  return { online: [], count: 0, max: 20 };
}

// Player action commands
const PLAYER_COMMANDS = {
  kick: (name, reason) => `kick ${name}${reason ? ' ' + reason : ''}`,
  ban: (name, reason) => `ban ${name}${reason ? ' ' + reason : ''}`,
  unban: (name) => `pardon ${name}`,
  op: (name) => `op ${name}`,
  deop: (name) => `deop ${name}`,
  'whitelist-add': (name) => `whitelist add ${name}`,
  'whitelist-remove': (name) => `whitelist remove ${name}`,
  gamemode: (name, _reason, args) => `gamemode ${args} ${name}`,
  tp: (name, _reason, args) => `tp ${name} ${args}`,
};

export default async function handler(req, res) {
  const { id: serverId } = req.query;

  // Verify server exists
  const config = await readConfig();
  const server = config.find(s => s.id === serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server non trovato' });
  }

  if (req.method === 'GET') {
    try {
      const worldDir = await findWorldDir(serverId);
      const playerDataDir = path.join(SERVERS_DIR, serverId, 'minecraft-server', worldDir, 'playerdata');

      // List all .dat files
      let datFiles = [];
      try {
        const files = await fs.readdir(playerDataDir);
        datFiles = files.filter(f => f.endsWith('.dat') && !f.endsWith('_old.dat'));
      } catch {
        // No playerdata directory yet
        return res.status(200).json({ players: [], onlineCount: 0, maxPlayers: 20 });
      }

      // Get UUID -> name mapping
      const userCache = await readUserCache(serverId);

      // Get online players
      const onlineInfo = await getOnlinePlayers(serverId);

      // Build player list
      const players = [];
      for (const file of datFiles) {
        const uuid = file.replace('.dat', '').toLowerCase();

        // Get name from usercache or Mojang
        let name = userCache[stripUUID(uuid)];
        if (!name) {
          name = await resolveNameFromMojang(uuid);
        }
        if (!name) {
          name = uuid.slice(0, 8) + '...';
        }

        // Check if online
        const online = onlineInfo.online.some(n => n.toLowerCase() === name.toLowerCase());

        // Get last modified time of the .dat file as "last seen"
        let lastSeen = null;
        try {
          const stat = await fs.stat(path.join(playerDataDir, file));
          lastSeen = stat.mtime.toISOString();
        } catch {}

        players.push({
          uuid: formatUUID(uuid),
          name,
          online,
          lastSeen
        });
      }

      // Sort: online first, then by name
      players.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.status(200).json({
        players,
        onlineCount: onlineInfo.count,
        maxPlayers: onlineInfo.max
      });
    } catch (error) {
      console.error('Error listing players:', error);
      res.status(500).json({ error: error.message });
    }

  } else if (req.method === 'POST') {
    // Execute player action
    try {
      const { action, playerName, reason, args } = req.body;

      if (!action || !playerName) {
        return res.status(400).json({ error: 'action e playerName sono obbligatori' });
      }

      const commandFn = PLAYER_COMMANDS[action];
      if (!commandFn) {
        return res.status(400).json({ error: `Azione non supportata: ${action}` });
      }

      const running = await isServerRunning(serverId);
      if (!running) {
        return res.status(400).json({ error: 'Il server non è in esecuzione' });
      }

      const command = commandFn(playerName, reason, args);
      await sendCommand(serverId, command);

      res.status(200).json({ success: true, command });
    } catch (error) {
      console.error('Error executing player action:', error);
      res.status(500).json({ error: error.message });
    }

  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

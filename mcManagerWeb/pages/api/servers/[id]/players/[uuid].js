const fs = require('fs').promises;
const path = require('path');
const { readConfig, SERVERS_DIR } = require('../../../../../lib/docker-server-manager');
const { parseNbtFile, extractPlayerData } = require('../../../../../lib/nbt-parser');

// Find world directory with playerdata
async function findWorldDir(serverId) {
  const serverDir = path.join(SERVERS_DIR, serverId, 'minecraft-server');
  const candidates = ['world', 'world_the_overworld'];

  for (const name of candidates) {
    try {
      await fs.access(path.join(serverDir, name, 'playerdata'));
      return name;
    } catch {}
  }

  try {
    const entries = await fs.readdir(serverDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          await fs.access(path.join(serverDir, entry.name, 'playerdata'));
          return entry.name;
        } catch {}
      }
    }
  } catch {}

  return 'world';
}

// Read usercache for name resolution
async function getPlayerName(serverId, uuid) {
  try {
    const cachePath = path.join(SERVERS_DIR, serverId, 'minecraft-server', 'usercache.json');
    const data = await fs.readFile(cachePath, 'utf8');
    const entries = JSON.parse(data);
    const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
    const entry = entries.find(e => e.uuid?.replace(/-/g, '').toLowerCase() === cleanUuid);
    if (entry) return entry.name;
  } catch {}

  // Fallback to Mojang API
  try {
    const cleanUuid = uuid.replace(/-/g, '');
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`);
    if (res.ok) {
      const data = await res.json();
      return data.name || null;
    }
  } catch {}

  return null;
}

export default async function handler(req, res) {
  const { id: serverId, uuid } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify server exists
  const config = await readConfig();
  const server = config.find(s => s.id === serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server non trovato' });
  }

  try {
    const worldDir = await findWorldDir(serverId);
    const serverDataDir = path.join(SERVERS_DIR, serverId, 'minecraft-server');
    const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
    // Format UUID with dashes (Minecraft stores files with dashed UUIDs)
    const dashedUuid = cleanUuid.length === 32
      ? `${cleanUuid.slice(0,8)}-${cleanUuid.slice(8,12)}-${cleanUuid.slice(12,16)}-${cleanUuid.slice(16,20)}-${cleanUuid.slice(20)}`
      : uuid.toLowerCase();

    // Parse player NBT data - try dashed UUID first (standard MC format), then clean
    let nbtPath = path.join(serverDataDir, worldDir, 'playerdata', `${dashedUuid}.dat`);
    try {
      await fs.access(nbtPath);
    } catch {
      nbtPath = path.join(serverDataDir, worldDir, 'playerdata', `${cleanUuid}.dat`);
    }
    let playerData = null;
    try {
      const nbtData = await parseNbtFile(nbtPath);
      playerData = extractPlayerData(nbtData);
    } catch (error) {
      console.error(`Error parsing NBT for ${uuid}:`, error.message);
      return res.status(404).json({ error: 'Dati giocatore non trovati o non leggibili' });
    }

    // Read stats (plain JSON)
    let stats = null;
    try {
      const statsPath = path.join(serverDataDir, worldDir, 'stats', `${dashedUuid}.json`);
      const statsData = await fs.readFile(statsPath, 'utf8');
      const parsed = JSON.parse(statsData);
      // Simplify stats structure
      const rawStats = parsed.stats || parsed;
      stats = {};

      // Extract key stats
      const statMappings = {
        'minecraft:custom': {
          'minecraft:play_time': 'playTime',
          'minecraft:play_one_minute': 'playTime', // older versions
          'minecraft:deaths': 'deaths',
          'minecraft:mob_kills': 'mobKills',
          'minecraft:player_kills': 'playerKills',
          'minecraft:damage_dealt': 'damageDealt',
          'minecraft:damage_taken': 'damageTaken',
          'minecraft:jump': 'jumps',
          'minecraft:walk_one_cm': 'walkDistance',
          'minecraft:sprint_one_cm': 'sprintDistance',
          'minecraft:fly_one_cm': 'flyDistance',
          'minecraft:swim_one_cm': 'swimDistance',
          'minecraft:animals_bred': 'animalsBred',
          'minecraft:fish_caught': 'fishCaught',
          'minecraft:traded_with_villager': 'villagerTrades',
          'minecraft:sleep_in_bed': 'timesSlept',
        }
      };

      for (const [category, mappings] of Object.entries(statMappings)) {
        const catData = rawStats[category] || {};
        for (const [mcKey, displayKey] of Object.entries(mappings)) {
          if (catData[mcKey] !== undefined) {
            stats[displayKey] = catData[mcKey];
          }
        }
      }

      // Convert ticks to hours for play time
      if (stats.playTime) {
        stats.playTimeHours = Math.round(stats.playTime / 72000 * 10) / 10;
      }
      // Convert cm to km for distances
      if (stats.walkDistance) stats.walkDistanceKm = Math.round(stats.walkDistance / 100000 * 10) / 10;
      if (stats.sprintDistance) stats.sprintDistanceKm = Math.round(stats.sprintDistance / 100000 * 10) / 10;
      if (stats.flyDistance) stats.flyDistanceKm = Math.round(stats.flyDistance / 100000 * 10) / 10;
      if (stats.swimDistance) stats.swimDistanceKm = Math.round(stats.swimDistance / 100000 * 10) / 10;

      // Count mined/crafted/broken totals
      const mined = rawStats['minecraft:mined'] || {};
      const crafted = rawStats['minecraft:crafted'] || {};
      const killed = rawStats['minecraft:killed'] || {};
      stats.totalBlocksMined = Object.values(mined).reduce((a, b) => a + b, 0);
      stats.totalItemsCrafted = Object.values(crafted).reduce((a, b) => a + b, 0);
      stats.uniqueMobsKilled = Object.keys(killed).length;
    } catch {}

    // Read advancements
    let advancements = null;
    try {
      const advPath = path.join(serverDataDir, worldDir, 'advancements', `${dashedUuid}.json`);
      const advData = await fs.readFile(advPath, 'utf8');
      const parsed = JSON.parse(advData);

      // Count completed advancements (exclude recipes)
      let completed = 0;
      let total = 0;
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith('minecraft:recipes/')) continue;
        if (key === 'DataVersion') continue;
        total++;
        if (value.done === true) completed++;
      }
      advancements = { completed, total };
    } catch {}

    // Resolve player name
    const name = await getPlayerName(serverId, uuid);

    res.status(200).json({
      uuid,
      name: name || cleanUuid.slice(0, 8) + '...',
      ...playerData,
      stats,
      advancements
    });
  } catch (error) {
    console.error('Error getting player detail:', error);
    res.status(500).json({ error: error.message });
  }
}

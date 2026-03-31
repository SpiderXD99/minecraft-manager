const nbt = require('prismarine-nbt');
const fs = require('fs').promises;

const GAME_MODES = { 0: 'Survival', 1: 'Creative', 2: 'Adventure', 3: 'Spectator' };
const DIMENSION_NAMES = {
  'minecraft:overworld': 'Overworld',
  'minecraft:the_nether': 'Nether',
  'minecraft:the_end': 'The End'
};

/**
 * Parse a gzip-compressed NBT .dat file
 * @param {string} filePath - Absolute path to .dat file
 * @returns {Promise<Object>} Simplified NBT data as plain JS object
 */
async function parseNbtFile(filePath) {
  const buffer = await fs.readFile(filePath);
  const { parsed } = await nbt.parse(buffer);
  return nbt.simplify(parsed);
}

/**
 * Extract structured player data from simplified NBT
 * @param {Object} data - Simplified NBT object from parseNbtFile
 * @returns {Object} Clean player data
 */
function extractPlayerData(data) {
  return {
    position: data.Pos ? {
      x: Math.floor(data.Pos[0]),
      y: Math.floor(data.Pos[1]),
      z: Math.floor(data.Pos[2])
    } : null,
    dimension: data.Dimension || 'minecraft:overworld',
    dimensionName: DIMENSION_NAMES[data.Dimension] || data.Dimension?.replace('minecraft:', '') || 'Overworld',
    health: data.Health ?? 0,
    maxHealth: 20,
    foodLevel: data.foodLevel ?? 0,
    foodSaturation: data.foodSaturationLevel ?? 0,
    xpLevel: data.XpLevel ?? 0,
    xpTotal: data.XpTotal ?? 0,
    score: data.Score ?? 0,
    gameMode: GAME_MODES[data.playerGameType] ?? 'Unknown',
    playerGameType: data.playerGameType ?? 0,
    selectedItemSlot: data.SelectedItemSlot ?? 0,
    inventory: (data.Inventory || []).map(item => ({
      slot: item.Slot,
      id: item.id?.replace('minecraft:', '') || 'unknown',
      rawId: item.id || 'unknown',
      count: item.Count ?? item.count ?? 1,
      tag: item.tag || null
    })),
    enderItems: (data.EnderItems || []).map(item => ({
      slot: item.Slot,
      id: item.id?.replace('minecraft:', '') || 'unknown',
      rawId: item.id || 'unknown',
      count: item.Count ?? item.count ?? 1,
      tag: item.tag || null
    })),
    abilities: {
      flying: data.abilities?.flying === 1,
      instabuild: data.abilities?.instabuild === 1,
      invulnerable: data.abilities?.invulnerable === 1,
      mayBuild: data.abilities?.mayBuild === 1,
      mayfly: data.abilities?.mayfly === 1,
      walkSpeed: data.abilities?.walkSpeed ?? 0.1,
      flySpeed: data.abilities?.flySpeed ?? 0.05
    }
  };
}

module.exports = { parseNbtFile, extractPlayerData, GAME_MODES, DIMENSION_NAMES };

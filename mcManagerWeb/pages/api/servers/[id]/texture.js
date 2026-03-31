import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';

const SERVERS_DIR = path.join(process.cwd(), 'data', 'servers');

// In-memory index: serverId -> { 'modid/item/name' -> jarPath }
const textureIndex = {};
// Track which servers have been indexed
const indexedServers = new Set();

async function buildModIndex(serverId) {
  const modsDir = path.join(SERVERS_DIR, serverId, 'minecraft-server', 'mods');
  const index = {};

  let jarFiles = [];
  try {
    jarFiles = (await fs.readdir(modsDir)).filter(f => f.endsWith('.jar'));
  } catch {
    return index; // no mods dir
  }

  for (const jar of jarFiles) {
    const jarPath = path.join(modsDir, jar);
    try {
      const zip = new AdmZip(jarPath);
      const entries = zip.getEntries();
      for (const entry of entries) {
        const name = entry.entryName;
        // Match: assets/{namespace}/textures/{type}/{name}.png
        const match = name.match(/^assets\/([^/]+)\/textures\/(item|block)\/(.+\.png)$/);
        if (match) {
          const key = `${match[1]}/${match[2]}/${match[3]}`;
          if (!index[key]) index[key] = jarPath;
        }
      }
    } catch {
      // skip unreadable jars
    }
  }

  return index;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  const { ns, type, name } = req.query;

  if (!ns || !type || !name) return res.status(400).json({ error: 'Missing params' });
  if (!['item', 'block'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  // Security: prevent path traversal
  if (/[./\\]/.test(ns) || /[/\\]/.test(name)) return res.status(400).end();

  const cacheDir = path.join(SERVERS_DIR, id, 'texture-cache', ns, type);
  const cachePath = path.join(cacheDir, `${name}.png`);

  // 1. Check disk cache
  try {
    const data = await fs.readFile(cachePath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(data);
  } catch {}

  // 2. Build/refresh mod index if needed
  if (!indexedServers.has(id)) {
    textureIndex[id] = await buildModIndex(id);
    indexedServers.add(id);
  }

  // 3. Look up texture in index
  const key = `${ns}/${type}/${name}.png`;
  const jarPath = textureIndex[id]?.[key];

  if (!jarPath) return res.status(404).end();

  // 4. Extract texture from JAR
  let textureData = null;
  try {
    const zip = new AdmZip(jarPath);
    const entry = zip.getEntry(`assets/${ns}/textures/${type}/${name}.png`);
    if (entry) textureData = zip.readFile(entry);
  } catch {}

  if (!textureData) return res.status(404).end();

  // 5. Save to disk cache and return
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, textureData);
  } catch {}

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(textureData);
}

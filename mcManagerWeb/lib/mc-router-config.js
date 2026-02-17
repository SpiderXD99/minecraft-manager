const { exec } = require('child_process');
const { promisify } = require('util');
const { normalizeSubdomain } = require('./utils');
const { MC_SUBDOMAIN_PREFIX } = require('./constants');

const execPromise = promisify(exec);

const BASE_DOMAIN = process.env.BASE_DOMAIN;

if (!BASE_DOMAIN) {
  throw new Error('BASE_DOMAIN environment variable is required. Please set it in your .env file.');
}

/**
 * Genera la stringa MAPPING per docker-compose
 */
function generateMappingString(servers) {
  const mappings = servers.map(server => {
    const subdomain = server.subdomain || normalizeSubdomain(server.name || server.id);

    const domain = `${subdomain}.${MC_SUBDOMAIN_PREFIX}.${BASE_DOMAIN}`;
    const containerName = `minecraft-server-${server.id}`;
    const backend = `${containerName}:25565`;

    return `${domain}=${backend}`;
  });

  return mappings.join(',');
}

/**
 * Scrive docker-compose.override.yml con i mapping aggiornati
 */
async function updateDockerComposeMappings(servers) {
  const fs = require('fs').promises;
  const path = require('path');
  const yaml = require('yaml');

  const mappingString = generateMappingString(servers);

  const override = {
    services: {
      'mc-router': {
        environment: {
          MAPPING: mappingString
        }
      }
    }
  };

  // Determina la directory root del progetto
  // Se siamo in Docker, usa PROJECT_ROOT, altrimenti usa path relativo
  const projectRoot = process.env.PROJECT_ROOT || path.join(process.cwd(), '..');
  const overridePath = path.join(projectRoot, 'docker-compose.override.yml');
  const yamlContent = yaml.stringify(override);

  await fs.writeFile(overridePath, yamlContent, 'utf8');
  console.log('✅ docker-compose.override.yml aggiornato');

  // Riavvia mc-router per applicare i cambiamenti
  try {
    const composeFile = path.join(projectRoot, 'docker-compose.yml');
    const overrideFile = path.join(projectRoot, 'docker-compose.override.yml');
    const projectName = 'minecraft-manager';
    await execPromise(
      `docker compose -p "${projectName}" -f "${composeFile}" -f "${overrideFile}" up -d mc-router`
    );
    console.log('✅ mc-router riavviato con nuovi mapping');
  } catch (error) {
    console.warn('⚠️  mc-router non riavviato:', error.message);
  }

  return mappingString;
}

module.exports = {
  generateMappingString,
  updateDockerComposeMappings
};

const { readConfig, generateDockerCompose } = require('../lib/docker-server-manager');

(async () => {
  try {
    console.log('Rigenerazione configurazioni server...');
    const config = await readConfig();

    for (const server of config) {
      console.log(`\nRigenerazione config per: ${server.name} (${server.id})`);
      await generateDockerCompose(server.id, server);
    }

    console.log('\n✅ Configurazioni rigenerate con successo!');
  } catch (error) {
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
})();

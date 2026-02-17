import path from 'path';
import fs from 'fs/promises';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    // Aumenta il timeout per upload di file grandi
    externalResolver: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Aumenta il timeout della richiesta HTTP a 10 minuti
  req.setTimeout(10 * 60 * 1000); // 10 minuti
  res.setTimeout(10 * 60 * 1000); // 10 minuti

  const { id } = req.query;
  const serverDir = path.join(process.cwd(), 'data', 'servers', id, 'minecraft-server');

  try {
    // Verifica che la directory del server esista
    await fs.access(serverDir);

    console.log(`[Upload] Starting upload for server ${id}`);

    // Parse del form con formidable
    const form = formidable({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 500 * 1024 * 1024, // 500MB max per file
      uploadDir: '/tmp',
      allowEmptyFiles: false,
      minFileSize: 0,
    });

    // Gestisci eventi di progresso
    form.on('fileBegin', (name, file) => {
      console.log(`[Upload] Receiving file: ${file.originalFilename || file.newFilename}`);
    });

    form.on('file', (name, file) => {
      console.log(`[Upload] File received: ${file.originalFilename || file.newFilename} (${file.size} bytes)`);
    });

    form.on('error', (err) => {
      console.error(`[Upload] Form error:`, err);
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Upload timeout after 5 minutes'));
      }, 5 * 60 * 1000); // 5 minuti

      form.parse(req, (err, fields, files) => {
        clearTimeout(timeout);
        if (err) {
          console.error('[Upload] Parse error:', err);
          reject(err);
        } else {
          console.log('[Upload] Parse completed successfully');
          resolve([fields, files]);
        }
      });
    });

    const targetPath = Array.isArray(fields.path) ? fields.path[0] : fields.path || '';
    const uploadedFiles = files.files;

    if (!uploadedFiles) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }

    // Gestisci sia file singoli che multipli
    const fileList = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
    let uploadCount = 0;

    console.log(`[Upload] Processing ${fileList.length} file(s)`);

    for (const file of fileList) {
      try {
        // Ottieni il nome del file originale
        const originalFilename = file.originalFilename || file.newFilename;

        // Se il file ha un path relativo (da upload cartella), preserva la struttura
        let relativePath = originalFilename;

        // Costruisci il percorso di destinazione
        const destPath = path.join(serverDir, targetPath, relativePath);
        const destDir = path.dirname(destPath);

        console.log(`[Upload] Moving file to: ${destPath}`);

        // Crea le directory necessarie
        await fs.mkdir(destDir, { recursive: true });

        // Sposta il file dalla temp alla destinazione
        await fs.copyFile(file.filepath, destPath);
        await fs.unlink(file.filepath); // Rimuovi il file temporaneo

        uploadCount++;
        console.log(`[Upload] File ${uploadCount}/${fileList.length} completed`);
      } catch (fileError) {
        console.error(`[Upload] Error processing file:`, fileError);
        // Continua con gli altri file anche se uno fallisce
      }
    }

    console.log(`[Upload] Upload completed: ${uploadCount} file(s) uploaded successfully`);

    res.status(200).json({
      success: true,
      message: `${uploadCount} file caricati con successo`,
      uploadedCount: uploadCount,
      totalFiles: fileList.length
    });

  } catch (error) {
    console.error('[Upload] Fatal error:', error);

    // Fornisci un messaggio di errore più dettagliato
    let errorMessage = 'Errore durante l\'upload dei file';
    if (error.message.includes('timeout')) {
      errorMessage = 'Upload timeout: il file è troppo grande o la connessione è troppo lenta';
    } else if (error.message.includes('aborted')) {
      errorMessage = 'Upload interrotto: la connessione è stata chiusa';
    } else if (error.code === 'ENOSPC') {
      errorMessage = 'Spazio su disco insufficiente';
    }

    res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
}

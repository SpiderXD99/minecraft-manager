import { MC_SUBDOMAIN_PREFIX } from '../../lib/constants';

/**
 * API endpoint per esporre la configurazione pubblica al frontend
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseDomain = process.env.BASE_DOMAIN;

  if (!baseDomain) {
    console.error('⚠️  BASE_DOMAIN environment variable is not set! Please configure it in your .env file.');
    return res.status(500).json({
      error: 'BASE_DOMAIN not configured',
      message: 'Please set BASE_DOMAIN in your .env file'
    });
  }

  res.status(200).json({
    baseDomain,
    mcDomain: `${MC_SUBDOMAIN_PREFIX}.${baseDomain}`,
  });
}

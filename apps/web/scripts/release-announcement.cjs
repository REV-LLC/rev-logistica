const { createHash } = require('node:crypto');

// A changed message creates a new announcement. Rebuilding the same message does not.
function buildReleaseAnnouncement(markdown, env = process.env) {
  const deployment = (env.NEXT_PUBLIC_DEPLOYMENT_ENV || env.VERCEL_ENV || '').trim().toLowerCase();
  if (deployment !== 'production') return null;
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;
  const [heading, ...lines] = normalized.split('\n');
  if (!heading.startsWith('# ') || !heading.slice(2).trim() || !lines.join('\n').trim()) {
    throw new Error('UPDATE.md debe tener un título (# Título) y un mensaje. Déjalo vacío para desactivar el aviso.');
  }
  return {
    id: createHash('sha256').update(normalized).digest('hex'),
    title: heading.slice(2).trim(),
    paragraphs: lines.join('\n').trim().split(/\n\s*\n/).map(paragraph => paragraph.trim()),
  };
}
module.exports = { buildReleaseAnnouncement };

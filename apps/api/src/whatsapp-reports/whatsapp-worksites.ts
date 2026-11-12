import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Draft, EquipmentReplyOptions } from './whatsapp-report.types';

const clean = (text: string, limit: number) =>
  text
    .replace(/[*_~`\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
export async function worksitePicker(
  prisma: PrismaService,
  requestedPage = 0,
  suggestedIds?: string[],
): Promise<{
  text: string;
  state: NonNullable<Draft['worksiteMenu']>;
  options?: EquipmentReplyOptions;
}> {
  if (suggestedIds?.length) {
    const sites = await prisma.customerWorksite.findMany({
      where: {
        id: { in: suggestedIds.slice(0, 5) },
        active: true,
        customer: { active: true },
        worksite: { active: true },
      },
      include: { worksite: true, customer: true },
    });
    const choices = suggestedIds
      .map((id) => sites.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (choices.length) {
      const token = randomUUID();
      const rows = choices.map((site, index) => ({
        id: `worksite:${token}:${index}`,
        title: clean(site.alias || site.worksite.name, 24),
        description: clean(`${site.worksite.name} · ${site.customer.name}`, 72),
      }));
      rows.push({
        id: `worksite_all:${token}:0`,
        title: 'Ver todas las obras',
        description: 'Buscar otra obra en el catálogo completo',
      });
      return {
        text: 'Encontré obras con nombres parecidos. Elige la correcta en «Ver obras» y revisa el cliente.',
        state: {
          token,
          page: 0,
          choices: choices.map((s) => s.id),
          suggested: true,
        },
        options: { type: 'list', button: 'Ver obras', rows },
      };
    }
  }
  const where = {
    active: true,
    customer: { active: true },
    worksite: { active: true },
  };
  const count = await prisma.customerWorksite.count({ where });
  const pages = Math.max(1, Math.ceil(count / 8));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const sites = await prisma.customerWorksite.findMany({
    where,
    include: { worksite: true, customer: true },
    orderBy: [
      { worksite: { name: 'asc' } },
      { customer: { name: 'asc' } },
      { id: 'asc' },
    ],
    skip: page * 8,
    take: 8,
  });
  const token = randomUUID();
  const rows = sites.map((site, index) => ({
    id: `worksite:${token}:${index}`,
    title: clean(site.alias || site.worksite.name, 24),
    description: clean(`${site.worksite.name} · ${site.customer.name}`, 72),
  }));
  if (page > 0)
    rows.push({
      id: `worksite_page:${token}:${page - 1}`,
      title: '← Anteriores',
      description: 'Ver las obras anteriores',
    });
  if (page + 1 < pages)
    rows.push({
      id: `worksite_page:${token}:${page + 1}`,
      title: 'Más obras →',
      description: 'Ver más obras',
    });
  return {
    text: count
      ? `Elige la obra en «Ver obras». No necesitas escribir su nombre exacto. Página ${page + 1} de ${pages}.`
      : 'No hay obras activas disponibles. Comunícate con oficina.',
    state: { token, page, choices: sites.map((site) => site.id) },
    options: rows.length
      ? { type: 'list', button: 'Ver obras', rows }
      : undefined,
  };
}

export type WorksiteCandidate = {
  id: string;
  name: string;
  alias: string | null;
  customer: string;
};
function wordSimilarity(a: string, b: string) {
  if (a.includes(b) || b.includes(a)) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous.splice(0, previous.length, ...row);
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1);
}
export function rankWorksites(
  candidates: WorksiteCandidate[],
  reference: string,
  customerReference?: string | null,
) {
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 180);
  const stop = new Set([
    'de',
    'la',
    'el',
    'los',
    'las',
    'obra',
    'colegio',
    'universidad',
    'cliente',
    's',
    'a',
    'sas',
    'proyecto',
  ]);
  const tokens = (s: string) =>
    normalize(s)
      .split(' ')
      .filter((t) => t.length > 2 && !stop.has(t));
  const words = tokens(reference);
  const customerWords = tokens(customerReference ?? '');
  const scoreWords = (query: string[], target: string[]) =>
    query.length
      ? query.reduce(
          (sum, w) =>
            sum + Math.max(0, ...target.map((t) => wordSimilarity(w, t))),
          0,
        ) / query.length
      : 0;
  return candidates
    .map((site) => ({
      site,
      score:
        scoreWords(words, tokens(`${site.name} ${site.alias ?? ''}`)) +
        scoreWords(customerWords, tokens(site.customer)) * 0.6,
    }))
    .filter((item) => item.score >= 0.45)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.site.name.localeCompare(b.site.name) ||
        a.site.id.localeCompare(b.site.id),
    )
    .slice(0, 12)
    .map((item) => item.site);
}
export async function worksiteCandidates(
  prisma: PrismaService,
  reference: string,
  customerReference?: string | null,
) {
  const sites = await prisma.customerWorksite.findMany({
    where: {
      active: true,
      customer: { active: true },
      worksite: { active: true },
    },
    select: {
      id: true,
      alias: true,
      worksite: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
    take: 1000,
  });
  return rankWorksites(
    sites.map((s) => ({
      id: s.id,
      name: s.worksite.name,
      alias: s.alias,
      customer: s.customer.name,
    })),
    reference,
    customerReference,
  );
}

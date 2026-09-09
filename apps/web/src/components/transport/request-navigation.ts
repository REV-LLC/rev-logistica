import { GenerateStep, SolicitudesTab } from './request-types';
export function normalizeSolicitudesTab(value: string | null): SolicitudesTab {
  return value === 'generate' ? 'generate' : 'list';
}

export function normalizeGenerateStep(value: string | null): GenerateStep {
  if (value === 'items' || value === 'sign') return value;
  return 'info';
}

export function readFlowStateFromUrl() {
  if (typeof window === 'undefined') {
    return { tab: 'list' as SolicitudesTab, step: 'info' as GenerateStep };
  }
  const params = new URLSearchParams(window.location.search);
  const tab = normalizeSolicitudesTab(params.get('tab'));
  return {
    tab,
    step:
      tab === 'generate' ? normalizeGenerateStep(params.get('step')) : 'info',
  };
}

export function pushFlowStateToUrl(
  tab: SolicitudesTab,
  step: GenerateStep,
  draftId?: string | null,
) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const isGenerateRoute = url.pathname.startsWith('/transport/generate');
  if (tab === 'generate' || isGenerateRoute) {
    if (isGenerateRoute) {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', 'generate');
    }
    url.searchParams.set('step', step);
    if (draftId) {
      url.searchParams.set('draft', draftId);
    } else {
      url.searchParams.delete('draft');
    }
  } else {
    url.searchParams.delete('tab');
    url.searchParams.delete('step');
    url.searchParams.delete('draft');
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.pushState(null, '', nextUrl);
  }
}

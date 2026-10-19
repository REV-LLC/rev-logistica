/** The persistent PageLoadingBoundary owns the shared full-screen presentation. */
export default function Loading() {
  return <div data-page-loading="true" aria-busy="true" aria-label="Cargando página" />;
}

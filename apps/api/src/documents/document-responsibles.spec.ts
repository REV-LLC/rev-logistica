import { parseDocumentResponsibleIds } from './document-responsibles';

describe('document responsible references', () => {
  it('restores UUID catalog identities from uppercase stored notes', () => {
    const id = 'e666c971-6b4e-4eb6-a1fe-2769dd8468ae';
    expect(parseDocumentResponsibleIds(`CONDUCTOR: ${id.toUpperCase()} | RECIBE: ${id.toUpperCase()} | DESPACHADOR: ${id.toUpperCase()}`))
      .toEqual({ driverId: id, receiverId: id, dispatcherId: id });
  });
  it('preserves opaque historical IDs and absent values', () => {
    expect(parseDocumentResponsibleIds('Recibe: Legacy-ID')).toEqual({ driverId: null, receiverId: 'Legacy-ID', dispatcherId: null });
    expect(parseDocumentResponsibleIds(null)).toEqual({ driverId: null, receiverId: null, dispatcherId: null });
  });
});

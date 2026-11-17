import { AnnexesService } from './annexes.service';

const periodFrom = new Date('2026-11-01Z');
const periodTo = new Date('2026-11-30Z');
const through = new Date('2026-11-18Z');
const registration = {periodFrom, periodTo, through, customerWorksite: {id:'site',customerId:'client'}, draft:null};

describe('open a consultation by its full numeric code', () => {
  const findUnique = jest.fn();
  const service = new AnnexesService({annexConsultationCode:{findUnique}} as never, {} as never);
  it('opens a live consultation before its first save, preserving leading zeros', async () => {
    findUnique.mockResolvedValueOnce(registration);
    await expect(service.findByCode('001113')).resolves.toEqual({
      customer:'client', worksite:'site', period:{from:'2026-11-01',to:'2026-11-30',through:'2026-11-18'},
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{code:'001113'}}));
  });
  it('opens the saved version with its latest data cutoff for the same code', async () => {
    findUnique.mockResolvedValueOnce({...registration, draft:{id:'saved', revisions:[{through:periodTo}]}});
    await expect(service.findByCode('0011132')).resolves.toMatchObject({draft:'saved', period:{through:'2026-11-30'}});
  });
  it('rejects malformed, unknown and retired codes', async () => {
    await expect(service.findByCode('123')).rejects.toThrow('numérico completo');
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({...registration, customerWorksite:null});
    for (const code of ['001113','0011132']) await expect(service.findByCode(code)).rejects.toThrow('No se encontró');
  });
});

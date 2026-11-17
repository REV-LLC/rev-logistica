import { AnnexesService } from './annexes.service';

const periodFrom = new Date('2026-11-01Z');
const periodTo = new Date('2026-11-30Z');
const through = new Date('2026-11-18Z');
const registration = {periodFrom, periodTo, through, customerWorksite: {id:'site',customerId:'client'}, draft:null};

describe('open a consultation by its full numeric code', () => {
  const findUnique = jest.fn();
  const findMany = jest.fn();
  const service = new AnnexesService({annexConsultationCode:{findUnique, findMany}} as never, {} as never);
  beforeEach(() => jest.clearAllMocks());
  it('opens a live consultation before its first save, preserving leading zeros', async () => {
    findUnique.mockResolvedValueOnce(registration);
    await expect(service.findByCode('001113', '2026')).resolves.toEqual({
      customer:'client', worksite:'site', period:{from:'2026-11-01',to:'2026-11-30',through:'2026-11-18'},
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{year_code:{year:2026,code:'001113'}}}));
  });
  it('opens the saved version with its latest data cutoff for the same code', async () => {
    findUnique.mockResolvedValueOnce({...registration, draft:{id:'saved', revisions:[{through:periodTo}]}});
    await expect(service.findByCode('0011132', '2026')).resolves.toMatchObject({draft:'saved', period:{through:'2026-11-30'}});
  });
  it('resolves the same number separately by year and never falls back to another year', async () => {
    findUnique.mockImplementation(async ({where}) => where.year_code.year === 2027
      ? {...registration, periodFrom:new Date('2027-11-01Z'),periodTo:new Date('2027-11-30Z'),through:new Date('2027-11-30Z')}
      : null);
    await expect(service.findByCode('001113', '2027')).resolves.toMatchObject({period:{from:'2027-11-01',to:'2027-11-30'}});
    await expect(service.findByCode('001113', '2025')).rejects.toThrow('No se encontró el anexo 001113 en 2025');
    findUnique.mockReset();
  });
  it('validates the year before querying', async () => {
    for (const year of ['', '26', '2026.5', '2026abc', '0000'])
      await expect(service.findByCode('001113', year)).rejects.toThrow('año válido');
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('offers registered years and the current business year without duplicates', async () => {
    findMany.mockResolvedValue([{year:2027},{year:2026},{year:2025}]);
    const current = Number(new Intl.DateTimeFormat('en',{timeZone:'America/Bogota',year:'numeric'}).format(new Date()));
    await expect(service.codeYears()).resolves.toEqual([...new Set([2027,2026,2025,current])].sort((a,b)=>b-a));
  });
  it('rejects malformed, unknown and retired codes', async () => {
    await expect(service.findByCode('123')).rejects.toThrow('numérico completo');
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({...registration, customerWorksite:null});
    for (const code of ['001113','0011132']) await expect(service.findByCode(code)).rejects.toThrow('No se encontró');
  });
});

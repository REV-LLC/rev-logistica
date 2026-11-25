import { WhatsappCustomerProfilesService } from './whatsapp-customer-profiles.service';
describe('Customer contact suggestions', () => {
  it('suggests existing customers with accent, abbreviation and spelling variations without creating them', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', name: 'PRODECON S.A.S.' },
          { id: 'b', name: 'SERVICIOS DE ALQUILER' },
        ]),
      },
    };
    const service = new WhatsappCustomerProfilesService(prisma as any);
    expect((await service.customers('Prodecn'))[0].id).toBe('a');
    expect((await service.customers('Prodecon SAS'))[0].id).toBe('a');
  });
  it('restricts worksite suggestions to the chosen active customer', async () => {
    const prisma = {
      customerWorksite: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'site',
              alias: 'Camacho',
              worksite: { name: 'COLEGIO UNICAMACHO', address: null },
            },
          ]),
      },
    };
    const service = new WhatsappCustomerProfilesService(prisma as any);
    expect((await service.worksites('customer-id', 'Camacho'))[0].id).toBe(
      'site',
    );
    expect(prisma.customerWorksite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId: 'customer-id',
          active: true,
          customer: { active: true },
          worksite: { active: true },
        },
      }),
    );
  });
});

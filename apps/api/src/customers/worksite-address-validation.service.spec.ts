import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { WorksiteAddressValidationService } from './worksite-address-validation.service';

describe('WorksiteAddressValidationService', () => {
  const service = new WorksiteAddressValidationService();
  const success = (country = 'CO') => ({
    result: {
      address: { formattedAddress: 'Avenida Carrera 7 #32-16, Bogotá, Colombia', postalAddress: { regionCode: country, locality: 'Bogotá' } },
      geocode: { location: { latitude: 4.62, longitude: -74.07 } },
    },
  });
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  });

  it('keeps the ordinary successful request to a single call', async () => {
    fetchMock.mockResolvedValue(reply(200, success()));
    const result = await service.validate({ address: ' Carrera 7 #32-16 ', city: ' Bogotá ' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.inputAddress).toBe('Carrera 7 #32-16');
    expect(result.location).toEqual({ lat: 4.62, lng: -74.07 });
  });

  it('retries Colombian permission errors with explicit country text and preserved context', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: { message: 'The caller does not have permission' } }))
      .mockResolvedValueOnce(reply(200, success()));
    const result = await service.validate({ address: 'Carrera 7 #32-16', regionCode: 'co', city: 'Bogotá', department: 'Bogotá D.C.' });
    const body = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(body.address).toEqual({ addressLines: ['Carrera 7 #32-16', 'Bogotá', 'Bogotá D.C.', 'Colombia'], locality: 'Bogotá', administrativeArea: 'Bogotá D.C.' });
    expect(result.googleContext.city).toBe('Bogotá');
  });

  it.each(['US', undefined])('rejects inferred results without confirmed Colombian country (%s)', async (country) => {
    const data = success();
    if (country) data.result.address.postalAddress.regionCode = country;
    else delete (data.result.address.postalAddress as { regionCode?: string }).regionCode;
    fetchMock.mockResolvedValueOnce(reply(403, {})).mockResolvedValueOnce(reply(200, data));
    await expect(service.validate({ address: 'Carrera 7' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not retry other countries or present permission failures as invalid input', async () => {
    fetchMock.mockResolvedValue(reply(403, {}));
    await expect(service.validate({ address: '1600 Amphitheatre Parkway', regionCode: 'US' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after one failed retry', async () => {
    fetchMock.mockImplementation(async () => reply(403, {}));
    await expect(service.validate({ address: 'Carrera 7' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry malformed input responses', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: { message: 'Invalid address' } }));
    await expect(service.validate({ address: 'Carrera 7' })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

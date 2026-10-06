import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type GoogleAddressValidationResponse = {
  result?: {
    verdict?: {
      inputGranularity?: string;
      validationGranularity?: string;
      geocodeGranularity?: string;
      hasInferredComponents?: boolean;
      hasReplacedComponents?: boolean;
      hasUnconfirmedComponents?: boolean;
    };
    address?: {
      formattedAddress?: string;
      postalAddress?: {
        regionCode?: string;
        administrativeArea?: string;
        locality?: string;
      };
    };
    geocode?: {
      location?: {
        latitude?: number;
        longitude?: number;
      };
      placeId?: string;
    };
  };
  error?: {
    message?: string;
  };
};

type WorksiteAddressValidationParams = {
  address: string;
  regionCode?: string;
  department?: string;
  city?: string;
};

@Injectable()
export class WorksiteAddressValidationService {
  async validate(params: WorksiteAddressValidationParams) {
    const { address } = params;
    const regionCode = (params.regionCode ?? 'CO').trim().toUpperCase();
    const cleanAddress = address.trim();
    if (!cleanAddress) {
      throw new BadRequestException('La dirección es obligatoria.');
    }
    const department = params.department?.trim();
    const city = params.city?.trim();

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('GOOGLE_MAPS_API_KEY no está configurada.');
    }

    const request = (inferColombia = false) => fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(
        apiKey,
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: {
            regionCode: inferColombia ? undefined : regionCode,
            administrativeArea: department || undefined,
            locality: city || undefined,
            addressLines: inferColombia
              ? [cleanAddress, ...[city, department].filter(Boolean), 'Colombia']
              : [cleanAddress],
          },
        }),
      },
    );

    let response = await request();
    let data = (await response.json()) as GoogleAddressValidationResponse;
    // Google currently rejects explicit CO for this project, while country
    // inference succeeds. Retry only that rejection and verify the country.
    const inferredColombia = response.status === 403 && regionCode === 'CO';
    if (inferredColombia) {
      response = await request(true);
      data = (await response.json()) as GoogleAddressValidationResponse;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ServiceUnavailableException('Google Maps rechazó el acceso para revisar esta dirección.');
      }
      throw new BadRequestException(
        data.error?.message ?? 'Google no pudo validar la dirección.',
      );
    }

    if (inferredColombia && data.result?.address?.postalAddress?.regionCode !== 'CO') {
      throw new BadRequestException('Google no confirmó que la dirección sugerida esté en Colombia.');
    }

    const formattedAddress = data.result?.address?.formattedAddress?.trim();
    if (!formattedAddress) {
      throw new BadRequestException('Google no encontró una dirección normalizada.');
    }

    const location = data.result?.geocode?.location;
    return {
      inputAddress: cleanAddress,
      formattedAddress,
      context: {
        department: department || null,
        city: city || null,
      },
      googleContext: {
        department: data.result?.address?.postalAddress?.administrativeArea ?? null,
        city: data.result?.address?.postalAddress?.locality ?? null,
      },
      placeId: data.result?.geocode?.placeId ?? null,
      location:
        location?.latitude !== undefined && location.longitude !== undefined
          ? { lat: location.latitude, lng: location.longitude }
          : null,
      verdict: {
        inputGranularity: data.result?.verdict?.inputGranularity ?? null,
        validationGranularity: data.result?.verdict?.validationGranularity ?? null,
        geocodeGranularity: data.result?.verdict?.geocodeGranularity ?? null,
        hasInferredComponents: data.result?.verdict?.hasInferredComponents ?? false,
        hasReplacedComponents: data.result?.verdict?.hasReplacedComponents ?? false,
        hasUnconfirmedComponents: data.result?.verdict?.hasUnconfirmedComponents ?? false,
      },
    };
  }
}

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
    const { address, regionCode = 'CO' } = params;
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

    const response = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(
        apiKey,
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: {
            regionCode,
            administrativeArea: department || undefined,
            locality: city || undefined,
            addressLines: [cleanAddress],
          },
        }),
      },
    );

    const data = (await response.json()) as GoogleAddressValidationResponse;
    if (!response.ok) {
      throw new BadRequestException(
        data.error?.message ?? 'Google no pudo validar la dirección.',
      );
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

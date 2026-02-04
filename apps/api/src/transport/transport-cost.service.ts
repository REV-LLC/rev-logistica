import { BadRequestException, Injectable } from '@nestjs/common';
import { TransportCostEstimateDto } from './dto/transport-cost-estimate.dto';

type LatLng = { lat: number; lng: number };

type DistanceResult = {
  distanceKm: number;
  durationSeconds?: number;
  source: 'override' | 'haversine' | 'mapbox';
};

@Injectable()
export class TransportCostService {
  async estimateCost(payload: TransportCostEstimateDto) {
    const distance = await this.resolveDistance(payload);
    const baseFee = payload.baseFee ?? 0;
    const minCharge = payload.minCharge ?? 0;
    const roundToNearest = payload.roundToNearest ?? 0;
    const rawCost = baseFee + distance.distanceKm * payload.ratePerKm;
    const boundedCost = Math.max(rawCost, minCharge);
    const cost = roundToNearest > 0 ? this.roundToNearest(boundedCost, roundToNearest) : boundedCost;

    return {
      distanceKm: distance.distanceKm,
      durationSeconds: distance.durationSeconds ?? null,
      cost,
      currency: payload.currency ?? null,
      breakdown: {
        baseFee,
        ratePerKm: payload.ratePerKm,
        rawCost,
        minCharge,
        roundToNearest: roundToNearest > 0 ? roundToNearest : null,
        distanceSource: distance.source,
      },
    };
  }

  private async resolveDistance(payload: TransportCostEstimateDto): Promise<DistanceResult> {
    if (payload.distanceKmOverride !== undefined) {
      if (payload.distanceKmOverride < 0) {
        throw new BadRequestException('distanceKmOverride must be >= 0.');
      }
      return {
        distanceKm: payload.distanceKmOverride,
        source: 'override',
      };
    }

    const origin = this.resolveLocation(
      payload.originAddress,
      payload.originLat,
      payload.originLng,
      'origin',
    );
    const destination = this.resolveLocation(
      payload.destinationAddress,
      payload.destinationLat,
      payload.destinationLng,
      'destination',
    );

    const provider = payload.routeProvider;
    const hasCoords = !!origin.coords && !!destination.coords;
    const hasAddresses = !!origin.address && !!destination.address;
    const hasMapbox = !!process.env.MAPBOX_ACCESS_TOKEN;

    if (provider === 'mapbox') {
      if (hasCoords) {
        return this.fetchDistanceFromMapbox(origin.coords!, destination.coords!, payload.routeProfile);
      }
      if (hasAddresses) {
        const [originCoords, destinationCoords] = await Promise.all([
          this.geocodeAddress(origin.address!),
          this.geocodeAddress(destination.address!),
        ]);
        return this.fetchDistanceFromMapbox(originCoords, destinationCoords, payload.routeProfile);
      }
      throw new BadRequestException('Mapbox requires origin/destination coordinates or addresses.');
    }

    if (provider === 'haversine') {
      if (!hasCoords) {
        throw new BadRequestException('Haversine requires origin/destination coordinates.');
      }
      return {
        distanceKm: this.haversineKm(origin.coords!, destination.coords!),
        source: 'haversine',
      };
    }

    if (hasMapbox) {
      if (hasCoords) {
        return this.fetchDistanceFromMapbox(origin.coords!, destination.coords!, payload.routeProfile);
      }
      if (hasAddresses) {
        const [originCoords, destinationCoords] = await Promise.all([
          this.geocodeAddress(origin.address!),
          this.geocodeAddress(destination.address!),
        ]);
        return this.fetchDistanceFromMapbox(originCoords, destinationCoords, payload.routeProfile);
      }
    }

    if (hasCoords) {
      return {
        distanceKm: this.haversineKm(origin.coords!, destination.coords!),
        source: 'haversine',
      };
    }

    throw new BadRequestException(
      'Provide origin/destination as coordinates or addresses. ' +
        'For Mapbox set MAPBOX_ACCESS_TOKEN.',
    );
  }

  private resolveLocation(
    address: string | undefined,
    lat: number | undefined,
    lng: number | undefined,
    label: string,
  ) {
    if (lat !== undefined || lng !== undefined) {
      if (lat === undefined || lng === undefined) {
        throw new BadRequestException(`${label}Lat and ${label}Lng must be provided together.`);
      }
      return { coords: { lat, lng }, address: null };
    }

    if (address) {
      return { coords: null, address };
    }

    throw new BadRequestException(`${label} address or coordinates are required.`);
  }

  private haversineKm(origin: LatLng, destination: LatLng) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(destination.lat - origin.lat);
    const dLng = toRad(destination.lng - origin.lng);
    const lat1 = toRad(origin.lat);
    const lat2 = toRad(destination.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private roundToNearest(value: number, nearest: number) {
    return Math.round(value / nearest) * nearest;
  }

  private async fetchDistanceFromMapbox(
    origin: LatLng,
    destination: LatLng,
    profile?: string,
  ): Promise<DistanceResult> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      throw new BadRequestException('MAPBOX_ACCESS_TOKEN is not configured.');
    }

    const safeProfile = profile ?? 'driving';
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const params = new URLSearchParams({
      access_token: accessToken,
      geometries: 'polyline6',
      overview: 'simplified',
    });

    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/${safeProfile}/${coordinates}?${params.toString()}`,
    );

    if (!response.ok) {
      throw new BadRequestException('Mapbox request failed.');
    }

    const data = (await response.json()) as {
      routes?: Array<{ distance?: number; duration?: number }>;
    };

    const route = data.routes?.[0];
    if (!route || route.distance === undefined) {
      throw new BadRequestException('Mapbox returned no route.');
    }

    return {
      distanceKm: route.distance / 1000,
      durationSeconds: route.duration ?? undefined,
      source: 'mapbox',
    };
  }

  private async geocodeAddress(address: string): Promise<LatLng> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      throw new BadRequestException('MAPBOX_ACCESS_TOKEN is not configured.');
    }

    const params = new URLSearchParams({
      access_token: accessToken,
      limit: '1',
    });

    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        address,
      )}.json?${params.toString()}`,
    );

    if (!response.ok) {
      throw new BadRequestException('Mapbox geocoding request failed.');
    }

    const data = (await response.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };

    const center = data.features?.[0]?.center;
    if (!center) {
      throw new BadRequestException('Mapbox geocoding returned no results.');
    }

    return { lng: center[0], lat: center[1] };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';

type CountryStateCityState = {
  id: number;
  name: string;
  iso2: string;
};

type CountryStateCityCity = {
  id: number;
  name: string;
};

@Injectable()
export class LocationsService {
  private readonly apiBase = 'https://api.countrystatecity.in/v1';
  private readonly countryIso2 = 'CO';

  async listDepartments() {
    const data = await this.fetchJson<CountryStateCityState[]>(
      `${this.apiBase}/countries/${this.countryIso2}/states`,
    );

    return data.map((state) => ({
      id: state.id,
      name: state.name,
      code: state.iso2,
    }));
  }

  async listCities(stateIso2: string) {
    if (!stateIso2) {
      throw new BadRequestException('state query param is required.');
    }

    const data = await this.fetchJson<CountryStateCityCity[]>(
      `${this.apiBase}/countries/${this.countryIso2}/states/${encodeURIComponent(stateIso2)}/cities`,
    );

    return data.map((city) => ({
      id: city.id,
      name: city.name,
    }));
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const apiKey = process.env.CSC_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('CSC_API_KEY is not configured.');
    }

    const response = await fetch(url, {
      headers: {
        'X-CSCAPI-KEY': apiKey,
      },
    });

    if (!response.ok) {
      throw new BadRequestException('CountryStateCity request failed.');
    }

    return (await response.json()) as T;
  }
}

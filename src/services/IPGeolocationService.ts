import { supabase } from '../lib/supabase';

export interface IPLocation {
  ip: string;
  country: string;
  city: string;
  region?: string;
  timezone?: string;
}

class IPGeolocationService {
  private static instance: IPGeolocationService;
  private cachedLocation: IPLocation | null = null;
  private readonly IPAPI_URL = 'https://ipapi.co/json/';
  private readonly FALLBACK_URL = 'https://api.ipify.org?format=json';

  static getInstance(): IPGeolocationService {
    if (!IPGeolocationService.instance) {
      IPGeolocationService.instance = new IPGeolocationService();
    }
    return IPGeolocationService.instance;
  }

  async getUserIPLocation(): Promise<IPLocation | null> {
    if (this.cachedLocation) {
      return this.cachedLocation;
    }

    try {
      console.log('🌍 Récupération de la géolocalisation IP...');

      const response = await fetch(this.IPAPI_URL);

      if (!response.ok) {
        throw new Error('Erreur API géolocalisation');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.reason || 'Erreur inconnue');
      }

      this.cachedLocation = {
        ip: data.ip || 'unknown',
        country: data.country_name || data.country || 'Unknown',
        city: data.city || 'Unknown',
        region: data.region,
        timezone: data.timezone
      };

      console.log('✅ Géolocalisation obtenue:', this.cachedLocation);
      return this.cachedLocation;

    } catch (error) {
      console.error('❌ Erreur géolocalisation:', error);
      return await this.getFallbackLocation();
    }
  }

  private async getFallbackLocation(): Promise<IPLocation | null> {
    try {
      console.log('🔄 Tentative avec API fallback...');

      const response = await fetch(this.FALLBACK_URL);
      const data = await response.json();

      this.cachedLocation = {
        ip: data.ip || 'unknown',
        country: 'Unknown',
        city: 'Unknown'
      };

      return this.cachedLocation;
    } catch (error) {
      console.error('❌ Fallback échoué:', error);
      return null;
    }
  }

  async storeUserLocation(userId: string): Promise<boolean> {
    try {
      const location = await this.getUserIPLocation();

      if (!location) {
        return false;
      }

      const { data, error } = await supabase.rpc('store_user_ip_location', {
        p_user_id: userId,
        p_ip_address: location.ip,
        p_country: location.country,
        p_city: location.city
      });

      if (error) {
        console.error('❌ Erreur stockage localisation:', error);
        return false;
      }

      console.log('✅ Localisation stockée pour utilisateur:', userId);
      return true;

    } catch (error) {
      console.error('❌ Erreur storeUserLocation:', error);
      return false;
    }
  }

  getCachedLocation(): IPLocation | null {
    return this.cachedLocation;
  }

  clearCache(): void {
    this.cachedLocation = null;
  }

  calculateDistance(loc1: IPLocation, loc2: IPLocation): 'same_city' | 'same_country' | 'different' {
    if (loc1.city === loc2.city && loc1.country === loc2.country) {
      return 'same_city';
    }
    if (loc1.country === loc2.country) {
      return 'same_country';
    }
    return 'different';
  }
}

export default IPGeolocationService;

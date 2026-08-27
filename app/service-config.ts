'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ServiceConfig } from './types';

const SERVICE_CONFIG_KEY = 'vores-camping:service-config:v1';

export const defaultServiceConfig: ServiceConfig = {
  customMapStyleUrl: '',
  mapProviderToken: '',
  openRouteServiceApiKey: '',
  openRouteServiceEndpoint: 'https://api.openrouteservice.org',
  geocodingEndpoint: 'https://api.openrouteservice.org/geocode',
  openPoiEndpoint: 'https://api.openrouteservice.org/pois',
  openElevationEndpoint: 'https://api.openrouteservice.org/elevation',
  vroomEndpoint: '',
};

function safeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 2048) : fallback;
}

function sanitize(value: unknown): ServiceConfig {
  const incoming = value && typeof value === 'object' ? value as Partial<ServiceConfig> : {};
  return {
    customMapStyleUrl: safeString(incoming.customMapStyleUrl),
    mapProviderToken: safeString(incoming.mapProviderToken),
    openRouteServiceApiKey: safeString(incoming.openRouteServiceApiKey),
    openRouteServiceEndpoint: safeString(incoming.openRouteServiceEndpoint, defaultServiceConfig.openRouteServiceEndpoint),
    geocodingEndpoint: safeString(incoming.geocodingEndpoint, defaultServiceConfig.geocodingEndpoint),
    openPoiEndpoint: safeString(incoming.openPoiEndpoint, defaultServiceConfig.openPoiEndpoint),
    openElevationEndpoint: safeString(incoming.openElevationEndpoint, defaultServiceConfig.openElevationEndpoint),
    vroomEndpoint: safeString(incoming.vroomEndpoint),
  };
}

export function isSafeServiceUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

export function maskSecret(value: string) {
  if (!value) return 'Ikke tilføjet';
  if (value.length < 8) return '••••••••';
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

export function useServiceConfig() {
  const [config, setConfig] = useState<ServiceConfig>(defaultServiceConfig);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SERVICE_CONFIG_KEY);
      if (saved) setConfig(sanitize(JSON.parse(saved)));
    } catch {
      setStorageError('Tjenesteindstillingerne kunne ikke læses. Standardendpoints bruges.');
    }
  }, []);

  const updateConfig = useCallback((patch: Partial<ServiceConfig>) => {
    setConfig((current) => {
      const next = sanitize({ ...current, ...patch });
      try {
        localStorage.setItem(SERVICE_CONFIG_KEY, JSON.stringify(next));
        setStorageError('');
      } catch {
        setStorageError('Tjenesteindstillingerne kunne ikke gemmes på denne enhed.');
      }
      return next;
    });
  }, []);

  const clearSecrets = useCallback(() => {
    updateConfig({ mapProviderToken: '', openRouteServiceApiKey: '' });
  }, [updateConfig]);

  const resetEndpoints = useCallback(() => {
    updateConfig(defaultServiceConfig);
  }, [updateConfig]);

  return { config, updateConfig, clearSecrets, resetEndpoints, storageError };
}

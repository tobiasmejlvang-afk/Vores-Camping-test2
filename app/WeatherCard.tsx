'use client';

import { useEffect, useState } from 'react';

type Weather = {
  temperature: number;
  apparent: number;
  wind: number;
  rain: number;
  code: number;
  updatedAt: string;
  stale?: boolean;
  days: { date: string; max: number; min: number; rain: number; code: number }[];
};

const weatherLabels: Record<number, [string, string]> = {
  0: ['Klart', '☀'], 1: ['Mest klart', '☀'], 2: ['Let skyet', '⛅'], 3: ['Overskyet', '☁'],
  45: ['Tåge', '≋'], 48: ['Rimtåge', '≋'], 51: ['Let støvregn', '☂'], 53: ['Støvregn', '☂'], 55: ['Kraftig støvregn', '☂'],
  61: ['Let regn', '☂'], 63: ['Regn', '☂'], 65: ['Kraftig regn', '☂'], 71: ['Let sne', '❄'], 73: ['Sne', '❄'], 75: ['Kraftig sne', '❄'],
  80: ['Lette byger', '☂'], 81: ['Byger', '☂'], 82: ['Kraftige byger', '☂'], 95: ['Torden', 'ϟ'], 96: ['Torden og hagl', 'ϟ'], 99: ['Kraftig torden', 'ϟ'],
};

function weatherLabel(code: number) { return weatherLabels[code] ?? ['Skiftende vejr', '☁']; }

export default function WeatherCard({ latitude, longitude, place, enabled = true }: { latitude: number; longitude: number; place: string; enabled?: boolean }) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const cacheKey = `vores-camping:weather:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    async function loadWeather() {
      try {
        const params = new URLSearchParams({
          latitude: String(latitude), longitude: String(longitude), timezone: 'auto', forecast_days: '4',
          current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('weather');
        const json = await response.json() as { current: { temperature_2m: number; apparent_temperature: number; wind_speed_10m: number; precipitation: number; weather_code: number }; daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; weather_code: number[] } };
        const next: Weather = {
          temperature: Math.round(json.current.temperature_2m), apparent: Math.round(json.current.apparent_temperature), wind: Math.round(json.current.wind_speed_10m), rain: Number(json.current.precipitation ?? 0), code: json.current.weather_code, updatedAt: new Date().toISOString(),
          days: json.daily.time.map((date: string, index: number) => ({ date, max: Math.round(json.daily.temperature_2m_max[index]), min: Math.round(json.daily.temperature_2m_min[index]), rain: json.daily.precipitation_probability_max[index] ?? 0, code: json.daily.weather_code[index] })),
        };
        localStorage.setItem(cacheKey, JSON.stringify(next));
        setWeather(next);
        setError(false);
      } catch {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as Weather;
            if (!Array.isArray(parsed.days) || !Number.isFinite(parsed.temperature) || !parsed.updatedAt) throw new Error('invalid cache');
            setWeather({ ...parsed, stale: true });
          } else {
            setWeather(null);
          }
        } catch {
          localStorage.removeItem(cacheKey);
          setWeather(null);
        }
        setError(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void loadWeather();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [enabled, latitude, longitude, refreshKey]);

  if (!enabled) return <article className="panel weather-full"><div className="empty-inline"><span>☀</span><strong>Vejret er slået fra</strong><small>Du kan aktivere det igen under Indstillinger.</small></div></article>;
  if (!weather && error) return <article className="panel weather-full"><div className="empty-inline"><span>☁</span><strong>Vejret kunne ikke hentes</strong><small>Dine øvrige data virker fortsat lokalt.</small><button className="text-button" type="button" onClick={() => { setError(false); setRefreshKey((key) => key + 1); }}>Prøv igen</button></div></article>;
  if (!weather) return <article className="panel weather-full"><div className="weather-skeleton" aria-label="Henter vejret"><i /><i /><i /></div></article>;
  const [label, icon] = weatherLabel(weather.code);

  return (
    <article className="panel weather-full">
      <div className="panel-title"><div><p className="eyebrow">{place}</p><h2>Vejret lige nu</h2></div><span className={weather.stale ? 'stale-chip' : 'fresh-chip'}>{weather.stale ? 'Senest kendte' : 'Live'}</span></div>
      <div className="weather-live"><span>{icon}</span><strong>{weather.temperature}°</strong><div><b>{label}</b><small>Føles som {weather.apparent}°</small></div></div>
      <div className="weather-metrics"><span><b>{weather.wind} km/t</b>Vind</span><span><b>{weather.rain} mm</b>Nedbør nu</span><span><b>{error ? 'Offline' : 'Klar'}</b>Datakilde</span></div>
      <div className="forecast-row">{weather.days.map((day) => { const [, dayIcon] = weatherLabel(day.code); return <div key={day.date}><b>{new Intl.DateTimeFormat('da-DK',{weekday:'short'}).format(new Date(`${day.date}T12:00:00`))}</b><span>{dayIcon}</span><strong>{day.max}°</strong><small>{day.min}° · {day.rain}%</small></div>; })}</div>
      <p className="provider-note">Prognose fra Open-Meteo · {weather.stale ? `senest hentet ${new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(weather.updatedAt))}` : 'opdateret automatisk'}</p>
    </article>
  );
}

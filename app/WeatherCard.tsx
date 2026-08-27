'use client';

import { useEffect, useMemo, useState } from 'react';

type Weather = {
  temperature: number;
  apparent: number;
  wind: number;
  gusts: number;
  rain: number;
  humidity: number;
  cloudCover: number;
  code: number;
  updatedAt: string;
  latitude: number;
  longitude: number;
  stale?: boolean;
  days: { date: string; max: number; min: number; rain: number; code: number; uv: number; sunrise: string; sunset: string }[];
};

const weatherLabels: Record<number, [string, string]> = {
  0: ['Klart', '☀'], 1: ['Mest klart', '☀'], 2: ['Let skyet', '⛅'], 3: ['Overskyet', '☁'],
  45: ['Tåge', '≋'], 48: ['Rimtåge', '≋'], 51: ['Let støvregn', '☂'], 53: ['Støvregn', '☂'], 55: ['Kraftig støvregn', '☂'],
  61: ['Let regn', '☂'], 63: ['Regn', '☂'], 65: ['Kraftig regn', '☂'], 71: ['Let sne', '❄'], 73: ['Sne', '❄'], 75: ['Kraftig sne', '❄'],
  80: ['Lette byger', '☂'], 81: ['Byger', '☂'], 82: ['Kraftige byger', '☂'], 95: ['Torden', 'ϟ'], 96: ['Torden og hagl', 'ϟ'], 99: ['Kraftig torden', 'ϟ'],
};

function weatherLabel(code: number) { return weatherLabels[code] ?? ['Skiftende vejr', '☁']; }

function validWeather(value: unknown): value is Weather {
  if (!value || typeof value !== 'object') return false;
  const weather = value as Weather;
  return [weather.temperature, weather.apparent, weather.wind, weather.gusts, weather.rain, weather.humidity, weather.cloudCover, weather.code, weather.latitude, weather.longitude].every(Number.isFinite) && typeof weather.updatedAt === 'string' && Array.isArray(weather.days);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function WeatherCard({ latitude, longitude, place, enabled = true, adviceEnabled = true }: { latitude: number; longitude: number; place: string; enabled?: boolean; adviceEnabled?: boolean }) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const retry = () => setRefreshKey((key) => key + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  useEffect(() => {
    if (!enabled) { setWeather(null); setError(false); return; }
    const cacheKey = `vores-camping:weather:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    let cachedWeather: Weather | null = null;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (validWeather(parsed)) cachedWeather = { ...parsed, stale: true };
      }
    } catch { /* Invalid cache is ignored and replaced by the next successful response. */ }
    setWeather(cachedWeather);
    setError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    async function loadWeather() {
      try {
        const params = new URLSearchParams({
          latitude: String(latitude), longitude: String(longitude), timezone: 'auto', forecast_days: '5',
          current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m,cloud_cover',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('weather');
        const json = await response.json() as { current?: Record<string, number>; daily?: Record<string, string[] | number[]> };
        const current = json.current; const daily = json.daily;
        if (!current || !daily || !Array.isArray(daily.time) || !daily.time.length) throw new Error('weather');
        const next: Weather = {
          temperature: Math.round(current.temperature_2m), apparent: Math.round(current.apparent_temperature), wind: Math.round(current.wind_speed_10m), gusts: Math.round(current.wind_gusts_10m), rain: Number(current.precipitation ?? 0), humidity: Math.round(current.relative_humidity_2m), cloudCover: Math.round(current.cloud_cover), code: current.weather_code, updatedAt: new Date().toISOString(), latitude, longitude,
          days: (daily.time as string[]).map((date, index) => ({ date, max: Math.round((daily.temperature_2m_max as number[])[index]), min: Math.round((daily.temperature_2m_min as number[])[index]), rain: (daily.precipitation_probability_max as number[])[index] ?? 0, code: (daily.weather_code as number[])[index], uv: Math.round(((daily.uv_index_max as number[])[index] ?? 0) * 10) / 10, sunrise: (daily.sunrise as string[])[index], sunset: (daily.sunset as string[])[index] })),
        };
        if (!validWeather(next)) throw new Error('weather');
        setWeather(next);
        setError(false);
        try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Fresh data remains visible if the cache is full. */ }
      } catch {
        setWeather((currentWeather) => currentWeather ? { ...currentWeather, stale: true } : null);
        setError(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void loadWeather();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [enabled, latitude, longitude, refreshKey]);

  const advice = useMemo(() => {
    if (!weather || !adviceEnabled) return [];
    const today = weather.days[0];
    const items: string[] = [];
    if (today?.rain >= 55 || weather.rain > 0.5) items.push('Regn er sandsynlig – læg udflugten tidligt eller tag regntøj med.');
    else if (weather.wind < 20 && weather.gusts < 32 && weather.temperature >= 10 && weather.temperature <= 26) items.push('Gode forhold til en cykeltur eller en længere gåtur.');
    if (weather.gusts >= 40) items.push('Kraftige vindstød – vær ekstra opmærksom med markise, fortelt og cykling.');
    if ((today?.uv ?? 0) >= 6) items.push(`Højt UV-indeks på ${today.uv} – planlæg skygge og solbeskyttelse midt på dagen.`);
    if (today?.sunset) items.push(`Solnedgang omkring ${timeLabel(today.sunset)} – et godt tidspunkt til feriebilleder.`);
    return items.slice(0, 3);
  }, [adviceEnabled, weather]);

  if (!enabled) return <article className="panel weather-full"><div className="empty-inline"><span>☀</span><strong>Vejret er slået fra</strong><small>Du kan aktivere det igen under Indstillinger.</small></div></article>;
  if (!weather && error) return <article className="panel weather-full"><div className="empty-inline"><span>☁</span><strong>Vejret kunne ikke hentes</strong><small>Dine øvrige data virker fortsat lokalt.</small><button className="text-button" type="button" onClick={() => { setError(false); setRefreshKey((key) => key + 1); }}>Prøv igen</button></div></article>;
  if (!weather) return <article className="panel weather-full"><div className="weather-skeleton" aria-label="Henter vejret"><i /><i /><i /></div></article>;
  const [label, icon] = weatherLabel(weather.code);

  return <article className="panel weather-full">
    <div className="panel-title"><div><p className="eyebrow">{place}</p><h2>Vejret lige nu</h2></div><span className={weather.stale ? 'stale-chip' : 'fresh-chip'}>{weather.stale ? 'Senest kendte' : 'Live'}</span></div>
    <div className="weather-live"><span>{icon}</span><strong>{weather.temperature}°</strong><div><b>{label}</b><small>Føles som {weather.apparent}°</small></div></div>
    <div className="weather-metrics weather-metrics-rich"><span><b>{weather.wind} km/t</b>Vind</span><span><b>{weather.gusts} km/t</b>Vindstød</span><span><b>{weather.rain} mm</b>Nedbør</span><span><b>{weather.humidity}%</b>Luftfugtighed</span><span><b>{weather.cloudCover}%</b>Skydække</span><span><b>UV {weather.days[0]?.uv ?? '–'}</b>Maks. i dag</span></div>
    {advice.length > 0 && <section className="weather-advice" aria-label="Praktiske vejrråd"><div><span>☀</span><strong>Meteo-råd til ferien</strong></div><ul>{advice.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    <div className="forecast-row">{weather.days.map((day) => { const [, dayIcon] = weatherLabel(day.code); return <div key={day.date}><b>{new Intl.DateTimeFormat('da-DK',{weekday:'short'}).format(new Date(`${day.date}T12:00:00`))}</b><span>{dayIcon}</span><strong>{day.max}°</strong><small>{day.min}° · {day.rain}%</small><em>☀ {timeLabel(day.sunrise)} · ◐ {timeLabel(day.sunset)}</em></div>; })}</div>
    <p className="provider-note">Prognose fra Open-Meteo · {weather.stale ? `senest hentet ${new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(weather.updatedAt))}` : 'opdateret automatisk'}</p>
  </article>;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CampingSite, Trip } from './types';

type MiniWeather = { temperature: number; code: number; fetchedAt: string };

const weatherCodes: Record<number, string> = { 0: 'Klart', 1: 'Næsten klart', 2: 'Let skyet', 3: 'Overskyet', 45: 'Tåge', 48: 'Rimtåge', 51: 'Let støvregn', 53: 'Støvregn', 55: 'Kraftig støvregn', 61: 'Let regn', 63: 'Regn', 65: 'Kraftig regn', 71: 'Let sne', 73: 'Sne', 75: 'Kraftig sne', 80: 'Regnbyger', 81: 'Regnbyger', 82: 'Kraftige byger', 95: 'Torden' };

function weatherIcon(code: number) {
  if (code === 0) return '☀';
  if ([1, 2].includes(code)) return '⛅';
  if ([3, 45, 48].includes(code)) return '☁';
  if ([71, 73, 75].includes(code)) return '❄';
  if (code >= 95) return '⚡';
  return '☂';
}

export default function DashboardClock({ nextTrip, activeSite, weatherEnabled }: { nextTrip?: Trip; activeSite?: CampingSite; weatherEnabled: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<MiniWeather | undefined>();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!weatherEnabled || !activeSite) { setWeather(undefined); return; }
    const cacheKey = `vores-camping:clock-weather:${activeSite.coordinates.map((value) => value.toFixed(2)).join(':')}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setWeather(JSON.parse(cached) as MiniWeather);
    } catch { /* The clock remains useful without a weather cache. */ }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5500);
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(activeSite.coordinates[1]));
    url.searchParams.set('longitude', String(activeSite.coordinates[0]));
    url.searchParams.set('current', 'temperature_2m,weather_code');
    url.searchParams.set('timezone', 'auto');
    fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('weather');
      const result = await response.json() as { current?: { temperature_2m?: number; weather_code?: number } };
      if (!Number.isFinite(result.current?.temperature_2m) || !Number.isFinite(result.current?.weather_code)) throw new Error('weather');
      const fresh = { temperature: result.current!.temperature_2m!, code: result.current!.weather_code!, fetchedAt: new Date().toISOString() };
      setWeather(fresh);
      try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch { /* Fresh weather still renders if caching is full. */ }
    }).catch(() => undefined).finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [activeSite, weatherEnabled]);

  const countdown = useMemo(() => {
    if (!nextTrip) return { value: '–', label: 'Ingen planlagt tur' };
    const days = Math.max(0, Math.ceil((Date.parse(`${nextTrip.startDate}T00:00:00`) - now.getTime()) / 86_400_000));
    return { value: String(days), label: days === 1 ? `dag til ${nextTrip.title}` : `dage til ${nextTrip.title}` };
  }, [nextTrip, now]);
  const hour = now.getHours() % 12;
  const minute = now.getMinutes();
  const second = now.getSeconds();

  return <article className="dashboard-clock" aria-label="Dato, klokkeslæt, vejr og nedtælling">
    <div className="clock-face" aria-hidden="true">
      <span className="clock-mark mark-12">12</span><span className="clock-mark mark-3">3</span><span className="clock-mark mark-6">6</span><span className="clock-mark mark-9">9</span>
      <i className="clock-hand hour" style={{ transform: `rotate(${hour * 30 + minute / 2}deg)` }} />
      <i className="clock-hand minute" style={{ transform: `rotate(${minute * 6}deg)` }} />
      <i className="clock-hand second" style={{ transform: `rotate(${second * 6}deg)` }} />
      <b className="clock-pin" />
    </div>
    <div className="clock-copy">
      <p className="eyebrow">Lige nu</p>
      <strong>{new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' }).format(now)}</strong>
      <span>{new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}</span>
      <div className="clock-weather"><b>{weather ? `${weatherIcon(weather.code)} ${Math.round(weather.temperature)}°` : weatherEnabled ? '☁ Vejr afventer' : '○ Vejr slået fra'}</b><small>{weather ? `${weatherCodes[weather.code] ?? 'Aktuelt vejr'} · ${activeSite?.place}` : activeSite?.place ?? 'Vælg en destination'}</small></div>
      <div className="clock-countdown"><strong>{countdown.value}</strong><span>{countdown.label}</span></div>
    </div>
  </article>;
}

'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { getMediaBlob } from './media-db';
import type { MediaItem, Trip } from './types';

export default function AlbumSlideshow({ media, activeTrip, reducedMotion, onOpen }: { media: MediaItem[]; activeTrip?: Trip; reducedMotion: boolean; onOpen: () => void }) {
  const slides = useMemo(() => [...media].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [media]);
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    Promise.all(slides.map(async (item) => {
      const blob = await getMediaBlob(item.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      created.push(url);
      if (!cancelled) setUrls((current) => ({ ...current, [item.id]: url }));
    })).catch(() => undefined);
    return () => { cancelled = true; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [slides]);

  useEffect(() => {
    if (reducedMotion || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, slides.length]);

  useEffect(() => { if (index >= slides.length) setIndex(0); }, [index, slides.length]);
  const slide = slides[index];

  return <article className="album-slideshow">
    <div className="slideshow-visual">
      {slide && urls[slide.id] ? <Image src={urls[slide.id]} width={980} height={620} unoptimized alt={slide.name} /> : <div className="slideshow-placeholder"><span>▣</span><small>Ferie Album</small></div>}
      <div className="slideshow-shade" />
      <div className="slideshow-caption"><p>Ferie Grafikeren</p><h2>{slide?.name ?? (activeTrip ? `Historien om ${activeTrip.title}` : 'Dine bedste campingminder')}</h2><span>{slide ? new Intl.DateTimeFormat('da-DK', { dateStyle: 'long' }).format(new Date(slide.createdAt)) : 'Tilføj billeder, så Misser kan begynde fortællingen.'}</span></div>
    </div>
    <div className="slideshow-controls">
      <button type="button" disabled={slides.length < 2} onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)} aria-label="Forrige minde">←</button>
      <div>{slides.length ? slides.map((item, itemIndex) => <button className={itemIndex === index ? 'active' : ''} type="button" aria-label={`Vis minde ${itemIndex + 1}`} onClick={() => setIndex(itemIndex)} key={item.id} />) : <span />}</div>
      <button type="button" disabled={slides.length < 2} onClick={() => setIndex((current) => (current + 1) % slides.length)} aria-label="Næste minde">→</button>
      <button className="slideshow-open" type="button" onClick={onOpen}>Åbn hele albummet</button>
    </div>
  </article>;
}

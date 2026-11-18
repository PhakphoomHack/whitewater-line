'use client';
import { useEffect, useState } from 'react';
import type { AudioDirector, SubtitleState } from './audio';

export function Subtitle({ audio }: { audio: AudioDirector }) {
  const [s, setS] = useState<SubtitleState | null>(null);
  useEffect(() => audio.onSubtitle(setS), [audio]);
  if (!s) return null;
  return (
    <div className="subtitle" key={s.key} role="status" aria-live="polite">
      <span className="who">{s.speaker}</span>
      <span className="line">{s.text}</span>
    </div>
  );
}

/** Inline subtitle for phone calls: shows the sentence being spoken. */
export function CallSubtitle({ audio, fallback }: { audio: AudioDirector; fallback: string }) {
  const [s, setS] = useState<SubtitleState | null>(null);
  useEffect(() => audio.onSubtitle(setS), [audio]);
  return <div className="callsub" aria-live="polite">{s ? s.text : fallback}</div>;
}

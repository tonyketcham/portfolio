'use client';

import { useRef } from 'react';
import { musicPosition, songFor } from '../audio/music';
import { TRACKS, type MusicMode } from '../audio/tracks';
import { sfx } from '../state/events';
import { useGame } from '../state/store';
import { useRaf } from './util';

const MODES: { id: MusicMode; label: string }[] = [
  { id: 'sequence', label: 'In order' },
  { id: 'shuffle', label: 'Shuffle' },
  { id: 'loop', label: 'Loop' },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The Music tab: the track list (red until heard, green after), now playing, and the slider. */
export function MusicPanel() {
  const sound = useGame((s) => s.plugins.sound);
  const setPlugin = useGame((s) => s.setPlugin);
  const track = useGame((s) => s.musicTrack);
  const paused = useGame((s) => s.musicPaused);
  const volume = useGame((s) => s.musicVolume);
  const mode = useGame((s) => s.musicMode);
  const heard = useGame((s) => s.musicHeard);
  const playTrack = useGame((s) => s.playTrack);
  const skipTrack = useGame((s) => s.skipTrack);
  const togglePaused = useGame((s) => s.toggleMusicPaused);
  const setVolume = useGame((s) => s.setMusicVolume);
  const setMode = useGame((s) => s.setMusicMode);
  const barRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  useRaf(() => {
    const pos = musicPosition();
    const length = pos?.length ?? songFor(track).length;
    const elapsed = pos && pos.index === track ? Math.min(pos.elapsed, length) : 0;
    if (barRef.current) barRef.current.style.transform = `scaleX(${elapsed / length})`;
    const text = `${clock(elapsed)} / ${clock(length)}`;
    if (timeRef.current && timeRef.current.textContent !== text) timeRef.current.textContent = text;
  });

  const unlocked = TRACKS.filter((t) => heard[t.id]).length;
  const silent = !sound || volume === 0;
  const playing = !silent && !paused;

  return (
    <div className="ow-music">
      <div className="ow-music-now">
        <small>Now playing:</small>
        <b>{TRACKS[track].name}</b>
        <div className="ow-music-bar" aria-hidden>
          <i ref={barRef} />
        </div>
        <span className="ow-music-time" ref={timeRef} />
      </div>

      <div className="ow-music-controls">
        <button className="ow-btn" aria-label="Previous track" onClick={() => skipTrack(-1)}>
          {'⏮︎'}
        </button>
        <button
          className="ow-btn ow-btn-primary"
          aria-label={playing ? 'Pause music' : 'Play music'}
          onClick={() => {
            if (silent) playTrack(track);
            else togglePaused();
            sfx('click');
          }}
        >
          {playing ? '⏸︎' : '▶︎'}
        </button>
        <button className="ow-btn" aria-label="Next track" onClick={() => skipTrack(1)}>
          {'⏭︎'}
        </button>
        <span className="ow-chips ow-music-modes" role="radiogroup" aria-label="Play order">
          {MODES.map((m) => (
            <button
              key={m.id}
              className="ow-chip"
              role="radio"
              aria-checked={mode === m.id}
              data-active={mode === m.id}
              onClick={() => {
                setMode(m.id);
                sfx('click');
              }}
            >
              {m.label}
            </button>
          ))}
        </span>
      </div>

      <div className="ow-fx-row ow-music-vol">
        <span className="ow-fx-name">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label="Music volume"
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <span className="ow-fx-val">{volume === 0 ? 'off' : `${Math.round(volume * 100)}%`}</span>
      </div>

      <ol className="ow-music-list">
        {TRACKS.map((t, i) => (
          <li key={t.id}>
            <button
              className="ow-quest"
              data-status={i === track && playing ? 'seen' : heard[t.id] ? 'done' : 'new'}
              aria-current={i === track ? 'true' : undefined}
              title={t.blurb}
              onClick={() => {
                playTrack(i);
                sfx('click');
              }}
            >
              <span>
                {i === track && playing ? '♪ ' : ''}
                {t.name}
              </span>
              <em>{clock(songFor(i).length)}</em>
            </button>
          </li>
        ))}
      </ol>

      {!sound && (
        <p className="ow-hint">
          Sound is off.{' '}
          <button className="ow-link" onClick={() => setPlugin('sound', true)}>
            Turn it on
          </button>{' '}
          to hear the band.
        </p>
      )}
      <p className="ow-hint">
        Unlocked {unlocked} of {TRACKS.length}. Every note is synthesised live in WebAudio, no samples. The tracks play in order and loop.
      </p>
    </div>
  );
}

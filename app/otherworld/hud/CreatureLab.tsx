'use client';

/**
 * The creature lab: a procedural character tool. Every knob maps straight onto
 * the spec the mesh, shader skin, walk and personality are grown from; the
 * draft stands next to you in the world while you work on it.
 */
import { useState } from 'react';
import { closeLab, openLab, releaseCreature, spawnDraft } from '../creatures/actions';
import {
  BODIES,
  EYE_STYLES,
  GAITS,
  LABELS,
  MAX_CREATURES,
  MOODS,
  MOUTHS,
  SKINS,
  SKIN_BLURBS,
  GEAR_SPEED,
  TOPPERS,
  mutate,
  randomName,
  randomPalette,
  randomSpec,
  voicePitch,
  type CreatureSpec,
} from '../creatures/spec';
import { sfx } from '../state/events';
import { PLACES } from '../world/places';
import { useGame } from '../state/store';
import { CreaturePortrait } from './CreaturePortrait';
import { GearShift } from './GearShift';

type Patch = (p: Partial<CreatureSpec>) => void;

function Chips<T extends string>({ label, options, value, onPick }: { label: string; options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="ow-lab-field">
      <span className="ow-lab-label">{label}</span>
      <div className="ow-chips ow-lab-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            className="ow-chip"
            role="radio"
            aria-checked={value === o}
            data-active={value === o}
            onClick={() => {
              sfx('click');
              onPick(o);
            }}
          >
            {LABELS[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="ow-fx-row ow-fx-res">
      <span className="ow-fx-name">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="ow-fx-val">{format ? format(value) : Math.round(value * 100)}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="ow-lab-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function Workbench({ draft }: { draft: CreatureSpec }) {
  const setDraft = useGame((s) => s.setLabDraft);
  const saved = useGame((s) => s.creatures.some((c) => c.id === draft.id));
  const patch: Patch = (p) => setDraft({ ...draft, ...p });

  return (
    <div className="ow-lab">
      <div className="ow-lab-head">
        <div className="ow-lab-portrait">
          <CreaturePortrait spec={draft} size={56} />
        </div>
        <div className="ow-lab-name">
          <input
            className="ow-lab-input"
            value={draft.name}
            maxLength={28}
            aria-label="Name"
            onChange={(e) => patch({ name: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="ow-lab-row">
            <button className="ow-btn" onClick={() => (sfx('pop'), setDraft({ ...randomSpec(), id: draft.id, born: draft.born, home: draft.home }))}>
              🎲 Reroll
            </button>
            <button className="ow-btn" onClick={() => (sfx('pop'), setDraft(mutate(draft)))}>
              Mutate
            </button>
            <button className="ow-btn" onClick={() => patch({ name: randomName() })} aria-label="Random name">
              Rename
            </button>
          </div>
        </div>
      </div>

      <Section title="Body">
        <Chips label="Shape" options={BODIES} value={draft.body} onPick={(body) => patch({ body })} />
        <Slider label="Height" value={draft.height} onChange={(height) => patch({ height })} />
        <Slider label="Girth" value={draft.girth} onChange={(girth) => patch({ girth })} />
        <Slider label="Size" value={draft.size} onChange={(size) => patch({ size })} />
      </Section>

      <Section title="Limbs">
        <Slider label="Legs" value={draft.legs} min={0} max={8} step={1} format={String} onChange={(legs) => patch({ legs })} />
        <Slider label="Leg length" value={draft.legLength} onChange={(legLength) => patch({ legLength })} />
        <Slider label="Arms" value={draft.arms} min={0} max={4} step={1} format={String} onChange={(arms) => patch({ arms })} />
      </Section>

      <Section title="Face">
        <Slider label="Eyes" value={draft.eyes} min={1} max={7} step={1} format={String} onChange={(eyes) => patch({ eyes })} />
        <Slider label="Eye size" value={draft.eyeSize} onChange={(eyeSize) => patch({ eyeSize })} />
        <Chips label="Eye style" options={EYE_STYLES} value={draft.eyeStyle} onPick={(eyeStyle) => patch({ eyeStyle })} />
        <Chips label="Mouth" options={MOUTHS} value={draft.mouth} onPick={(mouth) => patch({ mouth })} />
        <Chips label="On top" options={TOPPERS} value={draft.topper} onPick={(topper) => patch({ topper })} />
      </Section>

      <Section title="Shader skin">
        <Chips label="Skin" options={SKINS} value={draft.skin} onPick={(skin) => patch({ skin })} />
        <p className="ow-hint ow-lab-blurb">{SKIN_BLURBS[draft.skin]}</p>
        <div className="ow-lab-colors">
          {(['Body', 'Accent', 'Glow'] as const).map((label, i) => (
            <label key={label} className="ow-lab-color">
              <input
                type="color"
                value={draft.colors[i]}
                aria-label={`${label} colour`}
                onChange={(e) => {
                  const colors = [...draft.colors] as CreatureSpec['colors'];
                  colors[i] = e.target.value;
                  patch({ colors });
                }}
              />
              <span>{label}</span>
            </label>
          ))}
          <button className="ow-btn" onClick={() => patch({ colors: randomPalette() })}>
            🎲 Palette
          </button>
        </div>
        <Slider label="Wobble" value={draft.wobble} onChange={(wobble) => patch({ wobble })} />
      </Section>

      <Section title="Behaviour">
        <Chips label="Gait" options={GAITS} value={draft.gait} onPick={(gait) => patch({ gait })} />
        <div className="ow-lab-field">
          <span className="ow-lab-label">Gearbox · {draft.gear === 'N' ? 'parked' : draft.gear === 'R' ? 'moonwalks' : `speed ${draft.gear}`}</span>
          <GearShift label="Gearbox" value={draft.gear} onChange={(gear) => patch({ gear, speed: GEAR_SPEED[gear] })} />
        </div>
        <Chips label="Mood" options={MOODS} value={draft.mood} onPick={(mood) => patch({ mood })} />
        <div className="ow-lab-row">
          <Slider label="Voice" value={draft.voice} onChange={(voice) => patch({ voice })} />
          <button className="ow-btn" aria-label="Test voice" onClick={() => sfx('chirp', voicePitch(draft))}>
            ▶
          </button>
        </div>
      </Section>

      <div className="ow-lab-row ow-lab-actions">
        <button className="ow-btn" onClick={closeLab}>
          {saved ? 'Discard changes' : 'Scrap it'}
        </button>
        <button className="ow-btn ow-btn-primary" onClick={spawnDraft}>
          {saved ? 'Save changes' : 'Bring to life'}
        </button>
      </div>
      <p className="ow-hint">It’s standing next to you. Every skin is a live TSL shader; every walk is procedural.</p>
    </div>
  );
}

function Roster() {
  const creatures = useGame((s) => s.creatures);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="ow-lab">
      <button className="ow-btn ow-btn-primary ow-lab-new" disabled={creatures.length >= MAX_CREATURES} onClick={() => openLab()}>
        ＋ New creature
      </button>
      {creatures.length === 0 ? (
        <p className="ow-hint">Nobody here yet. Make something weird: it’ll wander around, chat, and follow you if you ask nicely.</p>
      ) : (
        <ul className="ow-lab-roster">
          {creatures.map((c) => (
            <li key={c.id} className="ow-lab-card">
              <CreaturePortrait spec={c} size={40} />
              <div className="ow-lab-card-text">
                <b>{c.name}</b>
                <span>
                  {LABELS[c.mood]} · {c.home ? PLACES[c.home.place].name : 'nowhere'}
                </span>
              </div>
              <button className="ow-btn" onClick={() => openLab(c)}>
                Edit
              </button>
              <button
                className="ow-btn ow-btn-danger"
                onClick={() => {
                  if (confirm !== c.id) return setConfirm(c.id);
                  setConfirm(null);
                  releaseCreature(c.id);
                }}
              >
                {confirm === c.id ? 'Sure?' : 'Release'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="ow-hint">
        {creatures.length}/{MAX_CREATURES} creatures. Long-press one in the world to talk, poke or take it with you.
      </p>
    </div>
  );
}

export function CreatureLab() {
  const draft = useGame((s) => s.labDraft);
  return draft ? <Workbench draft={draft} /> : <Roster />;
}

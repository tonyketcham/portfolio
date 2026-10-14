'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTweaks } from '../debug/tweaks';
import { runChatCommand } from '../state/actions';
import { emit, sfx } from '../state/events';
import { runtime, sayOverhead } from '../state/runtime';
import { skillById } from '../state/skills';
import { gameState, useGame } from '../state/store';
import { parseChatEffects } from './chatEffects';
import { profile } from '@/content/profile';
import { DIALOGUE, type Speaker } from './dialogues';
import type { CreatureSpec } from '../creatures/spec';
import { CreaturePortrait } from './CreaturePortrait';
import { CursorHead, SkillGlyph } from './icons';
import { TONE_COLOR } from './util';

// ── Choose Option ────────────────────────────────────────────────────────────
export function ContextMenu() {
  const menu = useGame((s) => s.menu);
  const close = useGame((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 200;
    const left = Math.max(6, Math.min(window.innerWidth - w - 6, menu.x - w / 2));
    const top = Math.max(6, Math.min(window.innerHeight - h - 6, menu.y - 10));
    setPos({ left, top });
  }, [menu]);

  if (!menu) return null;
  return (
    <>
      <div
        className="ow-menu-backdrop"
        onPointerDown={(e) => {
          e.preventDefault();
          close();
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={ref}
        className="ow-menu ow-panel"
        role="menu"
        style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: 'hidden' }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') close();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="ow-menu-title">Choose Option</div>
        {menu.options.map((o, i) => (
          <button
            key={i}
            role="menuitem"
            className="ow-menu-item"
            onClick={() => {
              sfx('click');
              o.run();
            }}
          >
            <span>{o.verb}</span>
            {o.target && <span style={{ color: TONE_COLOR[o.tone ?? 'plain'] }}> {o.target}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

// ── chat ─────────────────────────────────────────────────────────────────────
const KIND_CLASS: Record<string, string> = {
  game: 'ow-chat-game',
  npc: 'ow-chat-npc',
  public: 'ow-chat-public',
  system: 'ow-chat-system',
  fx: 'ow-chat-fx',
};

export function Chat() {
  const chat = useGame((s) => s.chat);
  const open = useGame((s) => s.chatOpen);
  const setOpen = useGame((s) => s.setChatOpen);
  const lines = useTweaks((t) => t.HUD.chatLines);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [chat, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') {
        setOpen(true);
        window.setTimeout(() => input.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const submit = () => {
    const text = draft.trim();
    setDraft('');
    if (!text) {
      input.current?.blur();
      return;
    }
    if (runChatCommand(text)) return;
    const g = gameState();
    const fx = parseChatEffects(text);
    g.say(fx.text, 'public', 'Toe Knee');
    sayOverhead(text.slice(0, fx.prefixLength + 80), 4);
    if (/^(hi|hello|hey|yo)\b/i.test(text)) g.addXp('curiosity', 1);
  };

  const visible = open ? chat.slice(-40) : chat.slice(-lines);
  return (
    <div className="ow-chat ow-panel" data-open={open}>
      <button className="ow-chat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Chat</span>
        <span className="ow-chat-toggle">{open ? '▾' : '▴'}</span>
      </button>
      <div ref={log} className="ow-chat-log" role="log" aria-live="polite">
        {visible.map((line) => (
          <div key={line.id} className={KIND_CLASS[line.kind]}>
            {line.from && <span className="ow-chat-from">{line.from}: </span>}
            {line.text}
          </div>
        ))}
      </div>
      {open && (
        <form
          className="ow-chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="ow-chat-field">Toe Knee:</label>
          <input
            id="ow-chat-field"
            ref={input}
            value={draft}
            maxLength={120}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="say something, or ::help"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') input.current?.blur();
              e.stopPropagation();
            }}
          />
          <span className="ow-chat-caret">*</span>
        </form>
      )}
    </div>
  );
}

export function XpDrops() {
  const drops = useGame((s) => s.xpDrops);
  const dismiss = useGame((s) => s.dismissXp);
  return (
    <div className="ow-xpdrops" aria-hidden>
      {drops.map((d) => (
        <div key={d.id} className="ow-xpdrop" onAnimationEnd={() => dismiss(d.id)}>
          <SkillGlyph id={d.skill} size={14} />
          <span>+{d.amount}</span>
        </div>
      ))}
    </div>
  );
}

// ── dialogue ─────────────────────────────────────────────────────────────────
function ChatHead({ speaker, creature }: { speaker: Speaker; creature?: CreatureSpec }) {
  if (speaker === 'creature' && creature)
    return (
      <div className="ow-head ow-head-creature">
        <CreaturePortrait spec={creature} size={64} />
      </div>
    );
  if (speaker === 'tony')
    return (
      <div className="ow-head ow-head-tony">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Amanita.webp" alt="" />
      </div>
    );
  if (speaker === 'card')
    return (
      <div className="ow-head ow-head-card">
        <span>TK</span>
      </div>
    );
  return (
    <div className="ow-head ow-head-player">
      <CursorHead size={54} />
    </div>
  );
}

const NAMES: Record<Speaker, string> = { tony: profile.handle, player: 'Toe Knee', card: 'Business card', narrator: '', creature: '' };

export function Dialogue() {
  const nodeId = useGame((s) => s.dialogue);
  const setDialogue = useGame((s) => s.setDialogue);
  const node = nodeId ? DIALOGUE[nodeId] : null;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    node?.enter?.();
  }, [nodeId, node]);

  useEffect(() => {
    if (!node || node.options) return;
    if (shown >= node.text.length) return;
    const id = window.setTimeout(() => setShown((n) => Math.min(node.text.length, n + 2)), 16);
    return () => window.clearTimeout(id);
  }, [node, shown]);

  if (!node) return null;
  const done = node.options || shown >= node.text.length;
  const advance = () => {
    if (!done) {
      setShown(node.text.length);
      return;
    }
    sfx('click');
    setDialogue(node.next ?? null);
  };

  return (
    <div className="ow-dialogue ow-panel" role="dialog" aria-label={`${node.name ?? NAMES[node.speaker]} says`}>
      <ChatHead speaker={node.options ? 'player' : node.speaker} creature={node.creature} />
      <div className="ow-dialogue-body">
        {node.options ? (
          <>
            <div className="ow-dialogue-name">{node.text}</div>
            <div className="ow-dialogue-options">
              {node.options.map((o) => (
                <button
                  key={o.label}
                  className="ow-dialogue-option"
                  onClick={() => {
                    sfx('click');
                    o.run?.();
                    setDialogue(o.next);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button className="ow-dialogue-text" onClick={advance}>
            <div className="ow-dialogue-name">{node.name ?? NAMES[node.speaker]}</div>
            <p>{node.text.slice(0, node.options ? undefined : shown)}</p>
            <span className="ow-dialogue-continue">{done ? 'Click here to continue' : '…'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── level up ─────────────────────────────────────────────────────────────────
const QUIPS: Record<string, string> = {
  tooling: 'You can now see the seams in other people’s design tools.',
  shaders: 'Everything looks slightly more like a shader.',
  tea: 'Your tea is getting stronger. So are you.',
  mycology: 'You can now identify an amanita at forty paces.',
  typography: 'Your kerning has opinions now.',
  physics: 'Gravity respects you a little more.',
  wandering: 'Your knees and toes feel fantastic.',
  curiosity: 'You notice things. Too many things.',
  generative: 'Your outputs now produce outputs.',
  prompting: 'Your pushback is now a meaningful architectural contribution.',
};

export function LevelUp() {
  const lu = useGame((s) => s.levelUp);
  const clear = useGame((s) => s.clearLevelUp);
  useEffect(() => {
    if (!lu) return;
    const p = runtime.player.pos;
    emit({ type: 'burst', kind: 'confetti', x: p.x, y: p.y + 1.4, z: p.z, count: 60 });
    const id = window.setTimeout(clear, 4200);
    return () => window.clearTimeout(id);
  }, [lu, clear]);
  const skill = useMemo(() => (lu ? skillById.get(lu.skill) : null), [lu]);
  if (!lu || !skill) return null;
  return (
    <button className="ow-levelup ow-panel" onClick={clear} key={lu.seq}>
      <SkillGlyph id={lu.skill} size={44} />
      <span className="ow-levelup-text">
        <span className="ow-levelup-title">Level up!</span>
        <span>
          {skill.name} is now <b>{lu.level}</b>.
        </span>
        <span className="ow-levelup-quip">{QUIPS[lu.skill]}</span>
      </span>
    </button>
  );
}

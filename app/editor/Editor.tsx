import { InteractiveCard } from '@/app/editor/InteractiveCard';
import React, { useCallback } from 'react';
import { useOnClickOutside } from 'usehooks-ts';

export function Editor() {
  const ref = React.useRef<HTMLDivElement>(null);
  useOnClickOutside(ref as React.RefObject<HTMLElement>, () =>
    setSelected(null)
  );

  const [selected, setSelected] = React.useState<string | null>(null);

  const handleSelection = useCallback(
    (title: string) => {
      setSelected(title);
    },
    [setSelected]
  );

  return (
    <section ref={ref} className="relative min-h-[720px] h-svh bg-dot">
      {/* Click to de-select */}
      <div className="absolute inset-0" onClick={() => setSelected(null)} />
      {/* Layers panel */}
      <div className="absolute left-6 inset-y-6 w-52 pointer-events-none">
        {/* <div className="bg-zinc-950/20 rounded-2xl border border-zinc-800 backdrop-blur-xs pointer-events-auto">
          <ul className="p-2">
            <li>File</li>
            <li>Edit</li>
            <li>View</li>
            <li>Insert</li>
            <li>Format</li>
            <li>Tools</li>
            <li>Help</li>
          </ul>
        </div> */}
      </div>

      <InteractiveCard
        selected={selected}
        onPointerDown={handleSelection}
        dragContainer={ref}
        title="Modyfi"
      >
        <div className="p-1">
          <div>Bye</div>
        </div>
      </InteractiveCard>

      <InteractiveCard
        selected={selected}
        onPointerDown={handleSelection}
        dragContainer={ref}
        title="Vague Data"
      >
        <div className="p-2">
          <div>Hello</div>
          <div>Hello</div>
          <div>Hello</div>
          <div>Hello</div>
        </div>
      </InteractiveCard>
    </section>
  );
}

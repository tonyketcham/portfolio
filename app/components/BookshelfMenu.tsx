export function BookshelfMenu() {
  return (
    <button
      className="inline fixed top-8 right-8 p-0.5 rounded-lg bg-zinc-800 border border-zinc-600 pointer-events-auto"
      onClick={() => {}}
    >
      {/* <SquareStack className="w-5 h-5" /> */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M7 7v10" />
        <path d="M11 7v10" />
        <path d="m15 7 2 10" />
      </svg>
    </button>
  );
}

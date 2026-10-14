/**
 * Who the island belongs to. Used by Tony's dialogue, the business card item,
 * the "About" menu, and the hill at the south of the island (Tony, Main
 * component), where every chapter below is an object you read in the book.
 * Add contact links here; they show up everywhere.
 */

export interface Chapter {
  id: string;
  title: string;
  /** Paragraphs. The book paginates them, so write as much as you like. */
  body: string[];
  /**
   * What holds it on the hill:
   * plinth  – the main component at the summit (the first chapter you read)
   * variant – a pedestal on the middle ledge with a statue of you (`prop` picks the pose)
   * note    – a comment pin stuck in the summit turf, for short opinions
   */
  at: 'plinth' | 'variant' | 'note';
  prop?: 'laptop' | 'teapot' | 'plotter';
  /** Copy written as a stand-in; confirm or rewrite. */
  draft?: boolean;
}

export interface ContactLink {
  label: string;
  href: string;
  /** Chat line when you use it from the mailbox. */
  note?: string;
}

export const profile = {
  name: 'Tony Ketcham',
  /** What the island calls him: Tony, said fast. The NPC, the hill and the book use it. */
  handle: 'Toe Knee',
  pronouns: 'he / they',
  title: 'Design Engineer building design tools',
  lines: ['Design Engineer building design tools', 'Expressive Design at Figma', 'Tea collector', 'Generative artist'],
  links: [
    { label: 'GitHub', href: 'https://github.com/tonyketcham', note: 'You post a letter to GitHub. It comes back as a pull request.' },
    { label: 'Modyfi', href: 'https://modyfi.com', note: 'The letter folds itself into a paper plane and heads for Modyfi Grove.' },
    // { label: 'Email', href: 'mailto:you@example.com', note: 'You post a letter. Somewhere, an inbox pings.' },
    // { label: 'LinkedIn', href: 'https://www.linkedin.com/in/…', note: 'The letter arrives with three endorsements for Tea.' },
  ] as ContactLink[],
  chapters: [
    {
      id: 'readme',
      title: 'README',
      at: 'plinth',
      draft: true,
      body: [
        "Hi, I'm Tony. I'm a design engineer: I build the tools other people design with.",
        'This island is my portfolio, drawn as a design file that got out of hand. Every project is a frame, every wire is a relationship, and this hill is the main component. You are, technically, an instance of it.',
        'The ledges below hold the rest of me: what I build, the tea, and the art. The stones on the way up are where I have worked, in order. The last page of this book is how to reach me.',
      ],
    },
    {
      id: 'engineer',
      title: 'Design engineer',
      at: 'variant',
      prop: 'laptop',
      draft: true,
      body: [
        "I'm a software engineer at Figma, where I built Figma Motion's timeline. Before that I was a founding engineer at Modyfi, a next-generation design workbench (procedural, GPU-native image editing and motion in the browser), until Figma acquired it.",
        'I like the seam between design and engineering, where a tool either gets out of your way or does not. Most of my work lives in that seam: editors, canvases, node graphs, shaders, and the small interactions that make them feel right.',
      ],
    },
    {
      id: 'tea',
      title: 'Tea collector',
      at: 'variant',
      prop: 'teapot',
      draft: true,
      body: [
        'I collect tea, mostly pu-erh, and brew it gongfu style in a 1960s Yixing shuiping.',
        'There is a stall by spawn. Help yourself; I will pretend not to notice.',
      ],
    },
    {
      id: 'artist',
      title: 'Generative artist',
      at: 'variant',
      prop: 'plotter',
      draft: true,
      body: [
        'I make generative art: sketches that grow, recursive trees, halftones that breathe. p5-Svelte, the little library in the Sketch Garden, started because I wanted my sketches to live inside my apps.',
        'The shader trees in Modyfi Grove are pieces too. Their canopies are the art.',
      ],
    },
    {
      id: 'undo',
      title: 'On undo',
      at: 'note',
      draft: true,
      body: ['A tool you can undo is a tool you can play with. Everything here rewinds, even the physics.'],
    },
    {
      id: 'defaults',
      title: 'On defaults',
      at: 'note',
      draft: true,
      body: ['Most people never change a default. So the default is the design.'],
    },
  ] as Chapter[],
};

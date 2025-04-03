import Image from 'next/image';
import PaperTexture from '@/public/paper_compressed.jpg';
import { cn } from '@/app/utils/css';

export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'grid place-content-center w-full h-96 text-zinc-800',
        className
      )}
    >
      <Image
        src={PaperTexture}
        alt="Paper texture"
        fill
        className="absolute inset-0 object-cover"
      />
      <div className="relative">
        <p className="">Hello!!!!!!!</p>
      </div>
    </footer>
  );
}

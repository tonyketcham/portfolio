import { TonyLogo } from '@/app/TonyLogo';
import { TransformBounds } from '@/app/TransformBounds';
import { Video } from '@/app/media/Video';
import { borderHighlightClasses } from '@/app/utils/borderHighlight';
import { cn } from '@/app/utils/css';
import Amanita from '@/public/Amanita.webp';

export default function Header({
  handleMushroomClick,
}: {
  handleMushroomClick: () => void;
}) {
  return (
    <header className="relative flex flex-row justify-end">
      <div className="absolute left-2 md:left-16 lg:left-56 inset-y-0 my-auto h-fit">
        <TransformBounds
          className="relative h-fit"
          renderDimensionFeedbackOnHover={
            <>
              he <span className="opacity-70">/</span> they
            </>
          }
        >
          <Video
            src="/Amanita.mp4"
            wrapperClassName={cn(
              'max-w-[300px] md:max-w-[425px] rounded-[158px] overflow-hidden',
              borderHighlightClasses({ group: true })
            )}
            className="object-cover aspect-square"
            poster={{
              src: '/Amanita.webp',
              data: Amanita,
            }}
            eager
          />
          <button
            type="button"
            onClick={handleMushroomClick}
            className="absolute right-[14%] bottom-[18%] pointer-events-auto w-2/6 h-1/4 rounded-full z-51"
            aria-label="Mushroom mode"
          />
        </TransformBounds>
      </div>
      <TonyLogo className="inline-block w-[85%] text-white" />
    </header>
  );
}

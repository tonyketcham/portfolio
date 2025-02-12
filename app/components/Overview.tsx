import {
  ListDecorator,
  TextList,
  TextListItem,
} from '@/app/components/TextList';

export default function Overview() {
  return (
    <section className="lg:grid grid-cols-7 gap-16 py-8">
      <TextList className="mx-auto lg:mx-0 col-span-3 col-start-5">
        <TextListItem className="text-white list">
          <ListDecorator>.:</ListDecorator>Design Engineer building design tools
        </TextListItem>
        <TextListItem>
          <ListDecorator>:.</ListDecorator>Tea collector
        </TextListItem>
        <TextListItem>
          <ListDecorator> .</ListDecorator>
          Generative artist
        </TextListItem>
      </TextList>
    </section>
  );
}

/**
 * Renders a Lucide icon by its kebab-case name (the same names used as
 * `data-lucide` attributes in the original markup), so config stays declarative.
 */
import { icons, type LucideProps } from 'lucide-react';

const toPascal = (name: string): string =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

interface IconProps extends LucideProps {
  name: string;
}

export function Icon({ name, ...props }: IconProps) {
  const Cmp = icons[toPascal(name) as keyof typeof icons];
  if (!Cmp) return null;
  return <Cmp {...props} />;
}

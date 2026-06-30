/**
 * Renders a Lucide icon by its kebab-case name. Handles the icons Lucide
 * renamed (e.g. `check-circle` → `circle-check`) via an alias map, and falls
 * back to a neutral dot so a stray name never renders as an empty box.
 */
import { icons, Circle, type LucideProps } from 'lucide-react';

const toPascal = (name: string): string =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** Map of legacy names → current Lucide canonical names. */
const ALIASES: Record<string, string> = {
  'alert-triangle': 'triangle-alert',
  'alert-circle': 'circle-alert',
  'check-circle': 'circle-check',
  'x-circle': 'circle-x',
  'help-circle': 'circle-help',
  'plus-circle': 'circle-plus',
  'minus-circle': 'circle-minus',
  'user-circle': 'circle-user',
  'download-cloud': 'cloud-download',
};

function resolve(name: string) {
  const canonical = ALIASES[name] ?? name;
  return icons[toPascal(canonical) as keyof typeof icons] ?? icons[toPascal(name) as keyof typeof icons] ?? Circle;
}

interface IconProps extends LucideProps {
  name: string;
}

export function Icon({ name, ...props }: IconProps) {
  const Cmp = resolve(name);
  return <Cmp {...props} />;
}

import { Icon } from './icons';
import type { Category } from '@/domain/types';

/**
 * A category as it appears in a list: colour swatch, icon, name.
 *
 * The colour carries no meaning the name does not already carry -- it exists so
 * a long list can be scanned by eye. That is why it is a swatch beside the
 * label rather than the label's own colour: text tinted with nine different
 * hues would fail contrast in at least one of the six theme/mode combinations,
 * and would clash with the status colours the rows already use.
 */
export function CategoryTag({
  category,
  size = 14,
}: {
  category: Category | undefined;
  size?: number;
}) {
  if (!category) return <span className="muted">--</span>;

  return (
    <span className="row category-tag" style={{ gap: 6 }}>
      <span
        className="dot category-dot"
        style={{ background: category.colour ?? 'var(--text-faint)' }}
        aria-hidden="true"
      />
      <Icon name={category.icon} size={size} />
      {category.name}
    </span>
  );
}

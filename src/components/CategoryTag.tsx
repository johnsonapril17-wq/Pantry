import type { CSSProperties } from 'react';
import { Icon } from './icons';
import { readableCategoryColour } from '@/domain/colour';
import type { Category } from '@/domain/types';

/**
 * A category as it appears in a list: colour swatch, icon, and the name printed
 * in the category's own colour.
 *
 * The name is not painted with the raw swatch hex. A colour picked to be
 * recognisable is rarely legible -- most mid-tones fail AA on a near-white
 * surface, and the same hex fails again from the other direction on a near-black
 * one. `readableCategoryColour()` keeps the hue and moves the lightness until it
 * clears 4.5:1, giving one shade for each mode.
 *
 * Both shades are emitted as custom properties and CSS picks between them on
 * `[data-mode]`, so switching theme needs no re-render and no JS knows the mode.
 *
 * The swatch stays even though the name now carries the colour: it holds a
 * constant left edge down the column, which is what makes a list scannable when
 * the names themselves are of wildly different lengths.
 */
export function CategoryTag({
  category,
  size = 14,
}: {
  category: Category | undefined;
  size?: number;
}) {
  if (!category) return <span className="muted">--</span>;

  const readable = readableCategoryColour(category.colour);
  const style = readable
    ? ({ '--cat-light': readable.light, '--cat-dark': readable.dark } as CSSProperties)
    : undefined;

  return (
    <span className="row category-tag" style={style}>
      <span
        className="dot category-dot"
        style={{ background: category.colour ?? 'var(--text-faint)' }}
        aria-hidden="true"
      />
      <Icon name={category.icon} size={size} />
      <span className="category-name">{category.name}</span>
    </span>
  );
}

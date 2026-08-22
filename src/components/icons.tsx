import {
  Apple,
  Archive,
  Banknote,
  Beef,
  Box,
  CakeSlice,
  CalendarDays,
  Camera,
  ChefHat,
  Cookie,
  CupSoda,
  Croissant,
  DoorClosed,
  Leaf,
  type LucideIcon,
  Milk,
  Package,
  Printer,
  Refrigerator,
  ScanLine,
  Settings as SettingsIcon,
  Snowflake,
  SprayCan,
  Soup,
  Store as StoreIcon,
  Tag,
  TrendingUp,
  Wheat,
  LayoutDashboard,
  ShoppingCart,
  PackageX,
} from 'lucide-react';

/**
 * "Create section icons" (notes, photo 03).
 *
 * Categories and locations store an icon *key* rather than a component, so the
 * icon survives export/import and can be changed without touching data.
 */
const REGISTRY: Record<string, LucideIcon> = {
  // Categories
  apple: Apple,
  beef: Beef,
  milk: Milk,
  croissant: Croissant,
  wheat: Wheat,
  can: Soup,
  leaf: Leaf,
  cake: CakeSlice,
  cookie: Cookie,
  cup: CupSoda,
  snowflake: Snowflake,
  spray: SprayCan,
  tag: Tag,

  // Locations
  door: DoorClosed,
  fridge: Refrigerator,
  cupboard: Archive,
  box: Box,

  // Sections
  dashboard: LayoutDashboard,
  pantry: Package,
  grocery: ShoppingCart,
  outofstock: PackageX,
  price: TrendingUp,
  budget: Banknote,
  receipts: Camera,
  homemade: ChefHat,
  mealprep: Soup,
  print: Printer,
  scan: ScanLine,
  settings: SettingsIcon,
  calendar: CalendarDays,
  store: StoreIcon,
};

export function iconFor(key: string | undefined): LucideIcon {
  return (key && REGISTRY[key]) || Tag;
}

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 2,
}: {
  name: string | undefined;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const C = iconFor(name);
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden />;
}

/** Keys offered when creating a category or location. */
export const ICON_KEYS = Object.keys(REGISTRY);

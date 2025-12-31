export const MARKET_CATEGORIES = [
  'All',
  'Sports',
  'Politics',
  'Finance',
  'Crypto',
  'World',
  'Entertainment',
  'Tech',
  'Weather',
  'General',
] as const;

export const MARKET_CATEGORIES_NO_ALL = MARKET_CATEGORIES.filter(
  (c) => c !== 'All'
) as Array<(typeof MARKET_CATEGORIES)[number]>;

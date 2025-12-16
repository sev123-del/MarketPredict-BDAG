// Off-chain allowlist for creator addresses (lowercase)
export const ALLOWED_CREATORS: string[] = [
  // Add addresses here as lowercase strings, e.g.:
  // '0xabc...'
];

export function isAllowedCreator(address?: string) {
  if (!address) return false;
  const a = address.toLowerCase();
  return ALLOWED_CREATORS.includes(a);
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Tab = {
  href: string;
  label: string;
};

const TABS: Tab[] = [
  { href: '/markets', label: 'Markets' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings' },
];

function isActivePath(current: string, href: string) {
  if (!current) return false;
  if (current === href) return true;
  // Treat nested routes as active (e.g., /market/[id] should still highlight Markets)
  if (href === '/markets' && (current === '/market' || current.startsWith('/market/'))) return true;
  return current.startsWith(href + '/');
}

export default function MobileBottomNavPages() {
  const router = useRouter();
  const current = router.asPath.split('?')[0] || '';

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const nav = useMemo(
    () => (
      <nav
        aria-label="Primary"
        className="lg:hidden fixed inset-x-0 bottom-0 z-60 border-t backdrop-blur"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'var(--mp-nav-bg)',
          borderColor: 'var(--mp-nav-border)',
        }}
      >
        <div className="mx-auto max-w-6xl px-2">
          <div className="flex items-center">
            {TABS.map((t) => {
              const active = isActivePath(current, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'flex-1 min-h-14 px-3 py-3 text-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFA3] ' +
                    (active ? 'text-[#00FFA3]' : '')
                  }
                  style={active ? undefined : { color: 'var(--mp-link-muted)' }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    ),
    [current]
  );

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(nav, document.body);
}

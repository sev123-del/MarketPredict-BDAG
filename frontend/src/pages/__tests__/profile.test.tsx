// This file was a test mistakenly placed under `src/pages` and caused Next to treat it as a page.
// Keep a tiny stub page here to satisfy the App Router during build. Real tests live in /test/.
import React from 'react';
import { describe, it } from 'vitest';

// This file is a harmless stub kept under `src/pages` so Next's App Router build
// doesn't treat it as a page. Provide a tiny test so the test runner doesn't
// error out looking for suites here.
describe('page test stub', () => {
  it('stub', () => {
    // no-op
  });
});

export default function TestStub() {
  return null;
}


// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Home from '../../src/app/(marketing)/page';

describe('Public Landing Page (Task 1.1, WEB-01)', () => {
  beforeEach(() => {
    // Mock IntersectionObserver for Motion animations in jsdom
    global.IntersectionObserver = class IntersectionObserver {
      disconnect() {}
      observe() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
    } as unknown as typeof globalThis.IntersectionObserver;
  });

  afterEach(() => {
    cleanup();
  });

  it('presents the Rp19.000 price, 3 package outputs, service steps, examples, FAQ, and AI limitations without requiring an account', () => {
    render(<Home />);

    expect(screen.getAllByText(/Rp19\.000/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/1[×x]\s*Analisis Personal Color/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/1[×x]\s*Analisis Body Shape/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/1[×x]\s*Virtual Try-On/i),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Beli satu token/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Seberapa akurat hasilnya/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Persetujuan dulu/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/FAQ/i).length,
    ).toBeGreaterThan(0);
  });
});

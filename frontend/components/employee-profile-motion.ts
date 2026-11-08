'use client';

import { useLayoutEffect, type RefObject } from 'react';

// Local to the employee overlay: no document-wide mouse tracking or animation loop.
export function useEmployeeProfileMotion(scope: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const seen = new WeakSet<HTMLElement>();
    let disposed = false;
    const cards = '.ep-portrait-card,.ep-mini-stats > article,.ep-bento-card,.ep-account-tile,.ep-section';
    const spotlight = '.ep-portrait-card,.ep-mini-stats > article,.ep-bento-card,.ep-account-tile';
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (disposed) return;
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer?.unobserve(entry.target);
      }
    }, { root, threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const enroll = () => {
      root.querySelectorAll<HTMLElement>(cards).forEach(card => {
        if (seen.has(card)) return;
        seen.add(card);
        card.classList.add('ep-motion-card');
        if (reduced.matches || !observer) card.classList.add('is-revealed');
        else observer.observe(card);
      });
    };
    enroll();
    // Resource cards arrive independently; observe only additions, not every animation frame.
    const mutations = new MutationObserver(enroll);
    mutations.observe(root, { childList: true, subtree: true });
    let frame = 0, active: HTMLElement | null = null, x = 0, y = 0;
    const clearSpot = () => {
      cancelAnimationFrame(frame); frame = 0;
      active?.removeAttribute('data-ep-spot');
      active?.style.removeProperty('--ep-spot-x'); active?.style.removeProperty('--ep-spot-y');
      active?.style.removeProperty('--ep-tilt-x'); active?.style.removeProperty('--ep-tilt-y');
      active = null;
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches || !fine.matches || event.pointerType === 'touch') return;
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(spotlight) : null;
      if (!card || !root.contains(card)) { clearSpot(); return; }
      if (card !== active) { clearSpot(); active = card; }
      const bounds = card.getBoundingClientRect();
      x = event.clientX - bounds.left; y = event.clientY - bounds.top;
      const tiltX = (-(y / bounds.height - 0.5) * 4).toFixed(2);
      const tiltY = ((x / bounds.width - 0.5) * 4).toFixed(2);
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (!active?.isConnected) { clearSpot(); return; }
        active.dataset.epSpot = 'true';
        active.style.setProperty('--ep-spot-x', `${x}px`); active.style.setProperty('--ep-spot-y', `${y}px`);
        active.style.setProperty('--ep-tilt-x', `${tiltX}deg`); active.style.setProperty('--ep-tilt-y', `${tiltY}deg`);
      });
    };
    const revealFocused = (event: FocusEvent) => {
      if (event.target instanceof Element) event.target.closest('.ep-motion-card')?.classList.add('is-revealed');
    };
    const changePreference = () => {
      clearSpot();
      if (reduced.matches) {
        observer?.disconnect();
        root.querySelectorAll('.ep-motion-card').forEach(card => card.classList.add('is-revealed'));
      }
    };
    reduced.addEventListener('change', changePreference); fine.addEventListener('change', clearSpot);
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', clearSpot); root.addEventListener('scroll', clearSpot, { passive: true });
    root.addEventListener('focusin', revealFocused); window.addEventListener('blur', clearSpot);
    return () => {
      disposed = true;
      clearSpot(); mutations.disconnect(); observer?.disconnect();
      reduced.removeEventListener('change', changePreference); fine.removeEventListener('change', clearSpot);
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', clearSpot);
      root.removeEventListener('scroll', clearSpot); root.removeEventListener('focusin', revealFocused);
      window.removeEventListener('blur', clearSpot);
      root.querySelectorAll('.ep-motion-card').forEach(card => card.classList.remove('ep-motion-card', 'is-revealed'));
    };
  }, [scope]);
}

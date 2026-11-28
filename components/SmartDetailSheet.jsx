'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import NavIcon from '@/components/NavIcon';
import styles from './smart-detail-sheet.module.css';

let activeSheet = null;
const sheets = [];
const subscribers = new Set();
const subscribe = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};
function updateActiveSheet() {
  activeSheet = sheets.at(-1) || null;
  subscribers.forEach((listener) => listener());
}

export function useActiveSheet() {
  return useSyncExternalStore(subscribe, () => activeSheet, () => null);
}

export default function SmartDetailSheet({
  title, subtitle, icon = "/catatan", onClose, children, footer, side = false, wide = false, onKeyDown,
}) {
  const [mounted, setMounted] = useState(false);
  const dialog = useRef(null);
  const panel = useRef(null);
  const heading = useRef(null);
  const closeButton = useRef(null);
  const dismissStart = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const origin = document.activeElement;
    const viewport = window.visualViewport;
    function resize() {
      element.style.setProperty('--sheet-height', `${viewport?.height ?? window.innerHeight}px`);
      element.style.setProperty('--sheet-top', `${viewport?.offsetTop ?? 0}px`);
      element.style.setProperty('--sheet-width', `${viewport?.width ?? window.innerWidth}px`);
      element.style.setProperty('--sheet-left', `${viewport?.offsetLeft ?? 0}px`);
    }
    resize();
    sheets.push(element);
    element.showModal();
    if (document.activeElement === closeButton.current) heading.current?.focus({ preventScroll: true });
    updateActiveSheet();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      const wasActive = activeSheet === element;
      sheets.splice(sheets.indexOf(element), 1);
      element.close();
      updateActiveSheet();
      if (wasActive && origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [mounted]);

  function endDrag(event, close) {
    const start = dismissStart.current;
    if (start?.id !== event.pointerId) return;
    dismissStart.current = null;
    panel.current?.style.removeProperty('--sheet-drag');
    if (close && event.clientY - start.y >= 60) onClose();
  }

  if (!mounted) return null;
  return createPortal(
    <dialog ref={dialog} className={styles.viewport} data-smart-sheet aria-modal="true"
      aria-labelledby={titleId} aria-describedby={subtitle ? descriptionId : undefined}
      data-side={side || undefined} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
        onKeyDown?.(event);
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className={styles.panel} data-wide={wide || undefined}>
        <div className={styles.handle} aria-hidden="true" onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          dismissStart.current = { id: event.pointerId, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={(event) => {
          const start = dismissStart.current;
          if (start?.id === event.pointerId) panel.current?.style.setProperty('--sheet-drag', `${Math.max(0, event.clientY - start.y)}px`);
        }} onPointerUp={(event) => endDrag(event, true)} onPointerCancel={(event) => endDrag(event, false)}
          onLostPointerCapture={(event) => endDrag(event, false)}><span /></div>
        <header className={styles.header}>
          {icon && <span className={styles.icon}><NavIcon name={icon} /></span>}
          <div><h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>{subtitle && <p id={descriptionId}>{subtitle}</p>}</div>
          <button type="button" className={styles.close} ref={closeButton} onClick={onClose}><span aria-hidden="true">×</span> Tutup</button>
        </header>
        <div className={`sheet ${styles.content}`}>{children}</div>
        <div className={styles.assist} data-smart-sheet-assist />
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>, document.body,
  );
}

export function SheetPeriod({ children }) {
  return <div className={styles.period}><NavIcon name="calendar" size={17} />{children}</div>;
}

export function SheetStats({ items }) {
  return <dl className={styles.stats}>
    {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

export function SheetSegments({ label, options, value, onChange }) {
  return <div className={styles.segments} role="group" aria-label={label}>
    {options.map(([key, text, icon]) => <button key={key} type="button" aria-pressed={key === value} onClick={() => onChange(key)}>
      {icon && <NavIcon name={icon} size={17} />}<span>{text}</span>
    </button>)}
  </div>;
}

export function SheetDisclosure({ title, children }) {
  return <details className={styles.disclosure}>
    <summary><NavIcon name="info" size={18} /><span>{title}</span><NavIcon name="down" size={16} /></summary>
    <div>{children}</div>
  </details>;
}

export function SheetEmpty({ icon = '/catatan', title, text, children }) {
  return <div className={styles.empty}>
    <span className={styles.emptyIcon} aria-hidden="true"><NavIcon name={icon} size={25} /></span>
    <h3>{title}</h3>
    <p>{text}</p>
    {children && <div className={styles.emptyActions}>{children}</div>}
  </div>;
}

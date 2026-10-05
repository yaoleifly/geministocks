import React from 'react';

export type ResearchIconName = 'brand' | 'research' | 'radar' | 'map' | 'history' | 'settings' | 'evidence' | 'search' | 'arrow' | 'attachment' | 'chip' | 'layers';
/** Mastersgo icons share a 24px grid, 1.7px strokes and a copper discovery marker. */
export function ResearchIcon({ name, ...props }: React.SVGProps<SVGSVGElement> & { name: ResearchIconName }) {
  const paths: Record<Exclude<ResearchIconName, 'brand'>, React.ReactNode> = {
    research: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h7M8 16h4"/><path d="M17 3h4v4" stroke="#B65C35"/></>,
    radar: <><path d="M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6"/><circle cx="20" cy="4" r="2" fill="#B65C35" stroke="none"/></>,
    map: <><path d="m10 7-5 9m9-9 5 9M7 19h10"/><circle cx="12" cy="5" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/></>,
    history: <><path d="M8 7V3h10l3 3v12h-4M3 8h10l3 3v10H3zM6 13h7M6 17h4"/><path d="M17 3v4h4" stroke="#B65C35"/></>,
    settings: <><path d="M3 5h6m4 0h8M3 12h12m4 0h2M3 19h3m4 0h11"/><circle cx="11" cy="5" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="8" cy="19" r="2"/></>,
    evidence: <><path d="M14 3H4v18h12V5zM12 3v5h4M7 12h5M7 16h3"/><path d="m16 16 2 2 4-5" stroke="#B65C35"/></>,
    search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    arrow: <path d="M3 12h17m-6-6 6 6-6 6"/>,
    attachment: <path d="m8 13 6-7a3 3 0 0 1 4 4l-8 9a5 5 0 0 1-7-7l9-9m-4 10 6-7"/>,
    chip: <><rect x="6" y="6" width="12" height="12" rx="1"/><path d="M10 2v4m4-4v4M10 18v4m4-4v4M2 10h4m-4 4h4m12-4h4m-4 4h4M10 10h4v4h-4z"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/><path d="m12 3 9 5" stroke="#B65C35"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{name === 'brand' ? <><path d="M12 3a9 9 0 1 0 9 9" strokeWidth="4" strokeLinecap="butt"/><path d="M17 2h6v6h-6z" fill="#B65C35" stroke="none"/></> : paths[name]}</svg>;
}

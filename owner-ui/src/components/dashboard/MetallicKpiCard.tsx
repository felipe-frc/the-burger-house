import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { metallicKpiPath } from '../../services/ownerMetallicKpi';
import type { KpiAppearance } from '../../services/ownerOverviewAppearance';

interface Props {
  tone: 'revenue' | 'jade' | 'steel' | 'slate' | 'coral';
  actionLabel: string;
  onOpen: () => void;
  children: ReactNode;
  appearance: KpiAppearance;
}

export function MetallicKpiCard({ tone, actionLabel, onOpen, children, appearance }: Props) {
  const ref = useRef<HTMLElement>(null);
  const frame = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, '');
  useLayoutEffect(() => {
    const element = ref.current;
    const svg = frame.current;
    if (!element || !svg) return;
    let previousWidth = 0, previousHeight = 0;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (Math.abs(previousWidth - width) < .1 && Math.abs(previousHeight - height) < .1) return;
      previousWidth = width;
      previousHeight = height;
      // Update this decorative SVG atomically in ResizeObserver, before paint.
      // No React render per resize and no transient scaled/elliptical arrow pocket.
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.querySelectorAll('[data-kpi-contour]').forEach(path => path.setAttribute('d', metallicKpiPath(width, height)));
      svg.querySelector('[data-kpi-inset]')?.setAttribute('d', metallicKpiPath(width, height, 5));
      svg.querySelectorAll('circle').forEach(circle => circle.setAttribute('cx', String(width - 26)));
      svg.querySelector('[data-kpi-shoulder]')?.setAttribute('offset', String(Math.min(.28, 48 / height)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = 220, height = 190;
  const body = metallicKpiPath(width, height);
  const inner = metallicKpiPath(width, height, 5);
  const arrowX = width - 26;
  return <article ref={ref} className={`owner-panel owner-kpi-hero${tone === 'coral' ? ' owner-kpi-attention' : ''}`}
    data-surface={tone} data-state={appearance.state} data-known={appearance.known}
    data-alert={appearance.state === 'critical' || undefined}
    aria-describedby={appearance.detail ? `${id}-explanation` : undefined}>
    <svg ref={frame} className="owner-kpi-metal" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="owner-kpi-metal-top" />
          <stop data-kpi-shoulder="" offset={Math.min(.28, 48 / height)} className="owner-kpi-metal-mid" />
          <stop offset=".8" className="owner-kpi-metal-base" />
          <stop offset="1" className="owner-kpi-metal-mid" />
        </linearGradient>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".035" />
          <stop offset=".38" stopColor="white" stopOpacity="0" />
          <stop offset=".53" stopColor="white" stopOpacity=".035" />
          <stop offset=".68" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity=".05" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2=".7" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".95" />
          <stop offset=".38" className="owner-kpi-metal-edge" />
          <stop offset=".7" stopColor="white" stopOpacity=".35" />
          <stop offset="1" className="owner-kpi-metal-edge" />
        </linearGradient>
        <pattern id={`${id}-brush`} width="3" height="3" patternUnits="userSpaceOnUse">
          <path d="M-1 3 3-1 M1 5 5 1" stroke="white" strokeWidth=".45" opacity=".025" />
        </pattern>
      </defs>
      <g className="owner-kpi-metal-cast">
        <path data-kpi-contour="" d={body} fill={`url(#${id}-face)`} stroke="var(--kpi-metal-base)" strokeWidth="2" />
        <path data-kpi-contour="" d={body} fill={`url(#${id}-light)`} />
        <path data-kpi-contour="" d={body} fill={`url(#${id}-brush)`} />
        <path data-kpi-contour="" d={body} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.3" />
        <path data-kpi-inset="" d={inner} fill="none" stroke={`url(#${id}-rim)`} strokeWidth=".8" opacity=".75" />
        <circle cx={arrowX} cy="18" r="17.5" fill={`url(#${id}-face)`} stroke="var(--kpi-metal-edge)" strokeWidth="2" />
        <circle cx={arrowX} cy="18" r="15.5" fill={`url(#${id}-light)`} stroke={`url(#${id}-rim)`} strokeWidth=".8" />
      </g>
    </svg>
    <div className="owner-kpi-content">{children}</div>
    <span className="owner-kpi-state-label" role="status" aria-live="polite" title={appearance.detail}>{appearance.label}</span>
    {appearance.detail && <span id={`${id}-explanation`} className="sr-only">{appearance.detail}</span>}
    <button type="button" className="owner-kpi-arrow" onClick={onOpen} aria-label={actionLabel} title={actionLabel}>
      <ArrowUpRight size={20} strokeWidth={1.65} aria-hidden="true" />
    </button>
  </article>;
}

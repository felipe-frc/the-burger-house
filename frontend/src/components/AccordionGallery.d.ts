import type { ComponentType } from 'react';

export interface AccordionItem {
  image: string;
  label: string;
  link?: string;
  alt?: string;
}

export interface AccordionGalleryProps {
  items?: AccordionItem[];
  defaultIndex?: number;
  expandRatio?: number;
  trigger?: 'hover' | 'click';
  accentColor?: string;
  overlayColor?: string;
  textColor?: string;
  grayscale?: boolean;
  duration?: number;
  parallax?: number;
  scrollParallax?: boolean;
  tilt?: number;
  height?: number;
  gap?: number;
  radius?: number;
  showLabels?: boolean;
  className?: string;
  ariaLabel?: string;
}

declare const AccordionGallery: ComponentType<AccordionGalleryProps>;
export default AccordionGallery;

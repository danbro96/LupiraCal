import { webLinks, type AppHosts } from '@danbro96/lupira-domain-links/appLinks';

const origin = (configured: string | undefined, prod: string, devPort: number) =>
  configured || (import.meta.env.DEV ? `http://localhost:${devPort}` : prod);

export const SIBLING_HOSTS: AppHosts = {
  cal: origin(import.meta.env.VITE_CAL_URL, 'https://cal.lupira.com', 5174),
  maps: origin(import.meta.env.VITE_MAPS_URL, 'https://maps.lupira.com', 5175),
  photos: origin(import.meta.env.VITE_PHOTOS_URL, 'https://photos.lupira.com', 5176),
  tasks: 'https://tasks.lupira.com',
};

export const siblingLinks = webLinks(SIBLING_HOSTS);

import { appLinks, webLinks, type AppLinks } from '@danbro96/lupira-domain-links/appLinks';
import { Linking } from 'react-native';
import { SIBLING_WEB_HOSTS } from '../config';

const app = appLinks();
const web = webLinks(SIBLING_WEB_HOSTS);

export function openSibling(link: (links: AppLinks) => string): void {
  Linking.openURL(link(app)).catch(() => Linking.openURL(link(web))).catch(() => undefined);
}

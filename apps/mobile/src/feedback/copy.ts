import * as Clipboard from 'expo-clipboard';
import { hapticSelection } from './haptics';
import { toast, toastError } from './toast';

/** Hold-to-copy: a tick when the hold registers, then "<what> copied". Android 13+ adds its own clipboard
 *  preview on top — the toast stays anyway, as in the sibling apps. */
export function copyText(text: string, what: string): void {
  hapticSelection();
  Clipboard.setStringAsync(text)
    .then(() => toast(`${what} copied`))
    .catch(() => toastError('Could not copy.'));
}

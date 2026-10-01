import { useSnackbar } from '../components/SnackbarHost';

/** Copy text, then say "<what> copied" — the confirmation the phone's hold-to-copy gives. */
export function useCopy(): (text: string, what: string) => void {
  const show = useSnackbar();
  return (text, what) => {
    navigator.clipboard.writeText(text).then(
      () => show(`${what} copied`, 'success'),
      () => show('Could not copy.'),
    );
  };
}

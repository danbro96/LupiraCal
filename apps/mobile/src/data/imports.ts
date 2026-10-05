import { PLACE_SUGGEST_LIMIT } from '@danbro96/lupira-domain-places/placeCandidates';
import { apiRequest } from '@danbro96/lupira-http/transport';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import { getReadItemDraftsUrl } from '@lupira/cal-api/fetch/cal';
import { getReadContactDraftsUrl } from '@lupira/cal-api/fetch/contact';
import { suggestPlaces } from '@lupira/cal-api/fetch/geo';
import { SuggestionType, type ContactDraftDto, type ItemDraftDto } from '@lupira/cal-api/models';
import { LupiraBridge } from '../../modules/lupira-bridge/src';
import { locationName, withResolvedLocation, type ContactDraft, type ItemDraft } from '../domain/drafts';

export type ImportKind = 'calendar' | 'contacts';

export type ImportDrafts =
  | { kind: 'calendar'; drafts: ItemDraft[] }
  | { kind: 'contacts'; drafts: ContactDraft[] };

const texts = new Map<string, Promise<string>>();

/** The bridge hands a shared file over once; its text stays here so a retry can send it again. */
export function readImportFile(name: string): Promise<string> {
  let text = texts.get(name);
  if (!text) {
    text = LupiraBridge.readImport(name);
    texts.set(name, text);
  }
  return text;
}

export function clearImportFiles(): Promise<void> {
  return LupiraBridge.clearImports().catch(() => undefined);
}

/** The server reads the file and answers with the drafts it holds. */
export async function draftsFor(kind: ImportKind, text: string): Promise<ImportDrafts> {
  if (kind === 'contacts') return { kind, drafts: await contactDraftsIn(text) };
  return { kind, drafts: await Promise.all((await itemDraftsIn(text)).map(placeDraft)) };
}

// The generated fetchers JSON-encode a string body, which would wrap the file in quotes.
function itemDraftsIn(text: string): Promise<ItemDraft[]> {
  return apiRequest<ItemDraftDto[]>(getReadItemDraftsUrl({ zone: deviceTimeZone() ?? undefined }), {
    method: 'POST',
    headers: { 'Content-Type': 'text/calendar' },
    body: text,
  });
}

function contactDraftsIn(text: string): Promise<ContactDraft[]> {
  return apiRequest<ContactDraftDto[]>(getReadContactDraftsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/vcard' },
    body: text,
  });
}

async function placeDraft(draft: ItemDraft): Promise<ItemDraft> {
  if (!draft.location?.trim()) return draft;
  const suggestions = await suggestPlaces({ q: locationName(draft.location), limit: PLACE_SUGGEST_LIMIT });
  return withResolvedLocation(draft, suggestions.filter((s) => s.type === SuggestionType.Place));
}

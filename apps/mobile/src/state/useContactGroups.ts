import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { Aggregate } from '../domain/aggregates';
import type { ContactGroupDoc } from '../domain/docTypes';
import { engine } from '../sync/engine';

export function useContactGroups() {
  return useQuery(mirrorQuery([Aggregate.contactGroup], async () =>
    (await engine.docs<ContactGroupDoc, null>(Aggregate.contactGroup))
      .map((d) => d.state.doc)
      .sort((a, b) => a.name.localeCompare(b.name))));
}

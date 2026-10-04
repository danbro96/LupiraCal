import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import {
  useClearContactDeceased,
  useMarkContactDeceased,
  useReviseContact,
  useSearchContacts,
  useSetContactAddresses,
  useSetContactChannels,
  useSetContactProfiles,
  useSetContactTags,
  useSetEmergencyContacts,
} from '@lupira/cal-api/query/contact';
import type {
  ContactDto,
  ContactPostalAddress,
  ContactReachChannel,
  ContactSocialProfileInput,
  ReviseContactRequest,
} from '@lupira/cal-api/models';
import { ContactAddressType, DisplayNameFormat, ReachMedium } from '@lupira/cal-api/models';
import { DISPLAY_NAME_FORMAT_LABELS as NAME_FORMAT_LABELS } from '@lupira/cal-domain/contactNames';
import { visibleTags, withPinPreserved } from '@lupira/cal-domain/contactTiers';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { PlacePicker } from '../places/PlacePicker';
import { errText } from '../../errText';
import { useSnackbar } from '../SnackbarHost';
import { fuzzyToInput, parseFuzzyInput, residencyStatus } from '@lupira/cal-domain/fuzzyDate';
import { birthdayFields, birthdayFromFields, partialDateKey } from '@lupira/cal-domain/partialDate';
import { contactNameError } from '@lupira/cal-domain/contactNames';
import { WrapRow } from '../WrapRow';

// placeId stays null in drafts until a place is picked; save filters those rows out.
type AddressDraft = Omit<ContactPostalAddress, 'placeId'> & { placeId: string | null; movedInText: string; movedOutText: string };

type ContactFormValues = {
  givenName: string;
  middleName: string;
  familyName: string;
  nickname: string;
  displayNameFormat: DisplayNameFormat;
  birthdayYearKnown: boolean;
  birthday: string;
  birthdayMonth: string;
  birthdayDay: string;
  channels: ContactReachChannel[];
  tags: string[];
  addresses: AddressDraft[];
  profiles: ContactSocialProfileInput[];
  emergency: string[];
  deceased: boolean;
  deathDate: string;
};

/** Null-vs-undefined and key-order insensitive shape for the addresses change diff. */
function normAddr(a: Omit<ContactPostalAddress, 'placeId'> & { placeId?: string | null }) {
  return { placeId: a.placeId ?? null, type: a.type, movedIn: fuzzyToInput(a.movedIn), movedOut: fuzzyToInput(a.movedOut) };
}

function AddressStatusHint({ movedInText, movedOutText }: { movedInText: string; movedOutText: string }) {
  const status = residencyStatus(
    movedInText.trim() ? parseFuzzyInput(movedInText) : null,
    movedOutText.trim() ? parseFuzzyInput(movedOutText) : null,
  );
  return status === 'active' ? null : <Typography variant="caption" sx={{ color: 'text.secondary' }}>{status === 'former' ? 'former' : 'upcoming'}</Typography>;
}

const norm = (s?: string | null) => (s ?? '').trim();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// Re-typed against the generated enum: a new format the shared labels lack stops compiling here.
const DISPLAY_NAME_FORMAT_LABELS: Record<DisplayNameFormat, string> = NAME_FORMAT_LABELS;

/** Add/remove editor for a simple string list (tags). */
function ChipList({ label, values, onChange, placeholder, inputType = 'text' }: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  inputType?: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
      <label>{label}</label>
      {values.length > 0 && (
        <WrapRow>
          {values.map((v, i) => (
            <Chip key={`${v}-${i}`} label={v} onDelete={() => onChange(values.filter((_, j) => j !== i))} />
          ))}
        </WrapRow>
      )}
      <WrapRow>
        <TextField
          type={inputType}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <Button variant="outlined" onClick={commit} disabled={!draft.trim()}>
          Add
        </Button>
      </WrapRow>
    </Box>
  );
}

/** Inline editor for a contact's fields. Scalars go through the merge update; the multi-valued fields use the
 *  wholesale-replace endpoints so entries can be removed. A single Save fans out only to the sections that changed. */
export function ContactEditForm({ contact, onDone }: { contact: ContactDto; onDone: () => void }) {
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const revise = useReviseContact();
  const setChannels = useSetContactChannels();
  const setTags = useSetContactTags();
  const setAddresses = useSetContactAddresses();
  const setProfiles = useSetContactProfiles();
  const setEmergency = useSetEmergencyContacts();
  const markDeceased = useMarkContactDeceased();
  const clearDeceased = useClearContactDeceased();
  // Emergency contacts may live in any book you can read.
  const { data: readable } = useSearchContacts({});

  const birthday = birthdayFields(contact.birthday);
  const {
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { isSubmitting, errors },
  } = useForm<ContactFormValues>({
    defaultValues: {
      givenName: contact.givenName ?? '',
      middleName: contact.middleName ?? '',
      familyName: contact.familyName ?? '',
      nickname: contact.nickname ?? '',
      displayNameFormat: contact.displayNameFormat ?? DisplayNameFormat.Full,
      birthdayYearKnown: birthday.yearKnown,
      birthday: birthday.date,
      birthdayMonth: birthday.month,
      birthdayDay: birthday.day,
      channels: contact.channels.map((c) => ({ ...c })),
      tags: visibleTags(contact.tags),
      // Residency dates are edited as text ("2015", "2015-06", "2015-06-12" — precision = certainty) and
      // parsed at save; a filled moved-out marks the address as former.
      addresses: contact.addresses.map((a) => ({
        ...a,
        movedInText: fuzzyToInput(a.movedIn),
        movedOutText: fuzzyToInput(a.movedOut),
      })),
      profiles: contact.profiles.map((p) => ({ ...p })),
      emergency: [...contact.emergencyContactIds],
      deceased: !!contact.deceased,
      deathDate: contact.deathDate ?? '',
    },
  });
  const { fields: channelFields, append: appendChannel, remove: removeChannel } = useFieldArray({ control, name: 'channels' });
  const { fields: addressFields, append: appendAddress, remove: removeAddress } = useFieldArray({ control, name: 'addresses' });
  const { fields: profileFields, append: appendProfile, remove: removeProfile } = useFieldArray({ control, name: 'profiles' });
  const birthdayYearKnown = watch('birthdayYearKnown');
  const watchedChannels = watch('channels');
  const watchedAddresses = watch('addresses');
  const deceased = watch('deceased');

  const id = contact.id;
  const nameOf = (cid: string) => readable?.find((c) => c.id === cid)?.displayName ?? cid.slice(0, 8);

  const save = handleSubmit(async (v) => {
    clearErrors('root');
    const nameError = contactNameError(v);
    if (nameError) {
      setError('root', { message: nameError });
      return;
    }

    // Parse before the first write. This used to sit between the name write and the address write,
    // so an unparseable residency date returned with the rename already committed — the user saw a
    // validation error and no sign that half the form had saved.
    const cleanAddresses: ContactPostalAddress[] = [];
    for (const a of v.addresses) {
      if (!a.placeId) continue;
      const movedIn = a.movedInText.trim() ? parseFuzzyInput(a.movedInText) : null;
      const movedOut = a.movedOutText.trim() ? parseFuzzyInput(a.movedOutText) : null;
      if ((a.movedInText.trim() && !movedIn) || (a.movedOutText.trim() && !movedOut)) {
        setError('root', { message: 'Residency dates must be YYYY, YYYY-MM, or YYYY-MM-DD.' });
        return;
      }
      cleanAddresses.push({ placeId: a.placeId, type: a.type, movedIn, movedOut });
    }

    try {
      const rev: ReviseContactRequest = {};
      if (norm(v.givenName) !== norm(contact.givenName)) rev.givenName = v.givenName;
      if (norm(v.middleName) !== norm(contact.middleName)) rev.middleName = v.middleName;
      if (norm(v.familyName) !== norm(contact.familyName)) rev.familyName = v.familyName;
      if (norm(v.nickname) !== norm(contact.nickname)) rev.nickname = v.nickname;
      if (v.displayNameFormat !== (contact.displayNameFormat ?? DisplayNameFormat.Full)) rev.displayNameFormat = v.displayNameFormat;
      const nextBirthday = birthdayFromFields({
        yearKnown: v.birthdayYearKnown, date: v.birthday, month: v.birthdayMonth, day: v.birthdayDay,
      });
      if (partialDateKey(nextBirthday) !== partialDateKey(contact.birthday)) rev.birthday = nextBirthday;
      if (Object.keys(rev).length > 0) await revise.mutateAsync({ id, data: rev });

      const cleanChannels = v.channels.filter((c) => c.value.trim()).map((c) => ({ ...c, value: c.value.trim() }));
      if (JSON.stringify(cleanChannels) !== JSON.stringify(contact.channels)) await setChannels.mutateAsync({ id, data: { channels: cleanChannels } });
      const nextTags = withPinPreserved(v.tags, contact.tags);
      if (!sameList(nextTags, contact.tags ?? [])) await setTags.mutateAsync({ id, data: { tags: nextTags } });

      if (JSON.stringify(cleanAddresses.map(normAddr)) !== JSON.stringify(contact.addresses.map(normAddr)))
        await setAddresses.mutateAsync({ id, data: { addresses: cleanAddresses } });

      const cleanProfiles = v.profiles.filter((p) => norm(p.service) && norm(p.handle));
      if (JSON.stringify(cleanProfiles) !== JSON.stringify(contact.profiles))
        await setProfiles.mutateAsync({ id, data: { profiles: cleanProfiles } });

      if (!sameList(v.emergency, contact.emergencyContactIds))
        await setEmergency.mutateAsync({ id, data: { contactIds: v.emergency } });

      if (v.deceased !== !!contact.deceased || (v.deceased && v.deathDate !== (contact.deathDate ?? ''))) {
        if (v.deceased) await markDeceased.mutateAsync({ id, data: { deathDate: v.deathDate || null } });
        else await clearDeceased.mutateAsync({ id });
      }

      invalidate();
      onDone();
    } catch (e) {
      showSnack(errText(e) ?? 'Save failed.');
    }
  });

  return (
    <Box onSubmit={save} component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <Controller name="givenName" control={control} render={({ field }) => <TextField label="Given name" {...field} />} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <Controller name="middleName" control={control} render={({ field }) => <TextField label="Middle name" {...field} />} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <Controller name="familyName" control={control} render={({ field }) => <TextField label="Family name" {...field} />} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <Controller name="nickname" control={control} render={({ field }) => <TextField label="Nickname" {...field} />} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <Controller
          name="displayNameFormat"
          control={control}
          render={({ field }) => (
            <TextField select label="Display as" {...field}>
              {Object.values(DisplayNameFormat).map((f) => (
                <MenuItem key={f} value={f}>
                  {DISPLAY_NAME_FORMAT_LABELS[f]}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <label>Birthday</label>
        <Controller
          name="birthdayYearKnown"
          control={control}
          render={({ field }) => (
            <Typography variant="caption" sx={{ color: 'text.secondary' }} component="label">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => {
                  field.onChange(e.target.checked);
                  setValue('birthday', '');
                  setValue('birthdayMonth', '');
                  setValue('birthdayDay', '');
                }}
              />{' '}
              Enter year
            </Typography>
          )}
        />
        {birthdayYearKnown ? (
          <Controller name="birthday" control={control} render={({ field }) => <TextField type="date" {...field} />} />
        ) : (
          <WrapRow>
            <Controller
              name="birthdayMonth"
              control={control}
              render={({ field }) => (
                <TextField type="number" slotProps={{ htmlInput: { min: 1, max: 12 } }} placeholder="Month" {...field} />
              )}
            />
            <Controller
              name="birthdayDay"
              control={control}
              render={({ field }) => (
                <TextField type="number" slotProps={{ htmlInput: { min: 1, max: 31 } }} placeholder="Day" {...field} />
              )}
            />
          </WrapRow>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <label>Reach channels</label>
        {channelFields.map((f, i) => (
          <WrapRow key={f.id}>
            <Controller
              name={`channels.${i}.medium`}
              control={control}
              render={({ field }) => (
                <TextField select {...field}>
                  {Object.values(ReachMedium).map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name={`channels.${i}.value`}
              control={control}
              render={({ field }) => (
                <TextField
                  placeholder={watchedChannels[i]?.medium === ReachMedium.Phone ? '+46…' : 'name@example.com'}
                  {...field}
                />
              )}
            />
            <Controller
              name={`channels.${i}.type`}
              control={control}
              render={({ field }) => (
                <TextField
                  placeholder="type (home/work…)"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              )}
            />
            <Controller
              name={`channels.${i}.preferred`}
              control={control}
              render={({ field }) => (
                <Typography variant="caption" sx={{ color: 'text.secondary' }} component="label">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.checked);
                      if (e.target.checked) {
                        const medium = getValues(`channels.${i}.medium`);
                        getValues('channels').forEach((x, j) => {
                          if (j !== i && x.medium === medium) setValue(`channels.${j}.preferred`, false); // ≤1 preferred per medium
                        });
                      }
                    }}
                  />{' '}
                  preferred
                </Typography>
              )}
            />
            <Tooltip title="Remove channel">
              <IconButton onClick={() => removeChannel(i)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </WrapRow>
        ))}
        <Button
          variant="text"
          onClick={() => appendChannel({ medium: ReachMedium.Email, value: '', type: null, preferred: false })}
        >
          + Add channel
        </Button>
      </Box>

      <Controller
        name="tags"
        control={control}
        render={({ field }) => <ChipList label="Tags" values={field.value} onChange={field.onChange} placeholder="work, family…" />}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <label>Addresses</label>
        {addressFields.map((f, i) => (
          <WrapRow key={f.id}>
            <Controller
              name={`addresses.${i}.type`}
              control={control}
              render={({ field }) => (
                <TextField select value={field.value ?? ContactAddressType.Home} onChange={field.onChange}>
                  {Object.values(ContactAddressType).map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name={`addresses.${i}.placeId`}
              control={control}
              render={({ field }) => <PlacePicker placeId={field.value ?? null} placeholder="Street, city…" onChange={field.onChange} />}
            />
            <Controller
              name={`addresses.${i}.movedInText`}
              control={control}
              render={({ field }) => (
                <Tooltip title="Moved in — YYYY, YYYY-MM, or YYYY-MM-DD; as precise as actually known">
                  <TextField placeholder="Moved in" {...field} />
                </Tooltip>
              )}
            />
            <Controller
              name={`addresses.${i}.movedOutText`}
              control={control}
              render={({ field }) => (
                <Tooltip title="Moved out — filling this marks the address as former">
                  <TextField placeholder="Moved out" {...field} />
                </Tooltip>
              )}
            />
            <AddressStatusHint
              movedInText={watchedAddresses[i]?.movedInText ?? ''}
              movedOutText={watchedAddresses[i]?.movedOutText ?? ''}
            />
            <Tooltip title="Remove address">
              <IconButton onClick={() => removeAddress(i)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </WrapRow>
        ))}
        <Button
          variant="text"
          onClick={() => appendAddress({ type: ContactAddressType.Home, placeId: null, movedInText: '', movedOutText: '' })}
        >
          + Add address
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <label>Social profiles</label>
        {profileFields.map((f, i) => (
          <WrapRow key={f.id}>
            <Controller
              name={`profiles.${i}.service`}
              control={control}
              render={({ field }) => (
                <TextField placeholder="service (telegram…)" value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
            <Controller
              name={`profiles.${i}.handle`}
              control={control}
              render={({ field }) => (
                <TextField placeholder="handle" value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
            <Controller
              name={`profiles.${i}.preferred`}
              control={control}
              render={({ field }) => (
                <Typography variant="caption" sx={{ color: 'text.secondary' }} component="label">
                  <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /> preferred
                </Typography>
              )}
            />
            <Tooltip title="Remove profile">
              <IconButton onClick={() => removeProfile(i)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </WrapRow>
        ))}
        <Button variant="text" onClick={() => appendProfile({ service: '', handle: '', preferred: false })}>
          + Add profile
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <label>Emergency contacts</label>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">In priority order — who to call about this person.</Typography>
        <Controller
          name="emergency"
          control={control}
          render={({ field }) => {
            const emergencyPickable = (readable ?? []).filter((c) => c.id !== id && !field.value.includes(c.id));
            return (
              <>
                {field.value.map((cid, i) => (
                  <Box key={cid} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
                    <Chip variant="outlined" label={i + 1} />
                    <Box component="span" sx={{ flex: 1 }}>{nameOf(cid)}</Box>
                    <Tooltip title="Remove">
                      <IconButton onClick={() => field.onChange(field.value.filter((x) => x !== cid))}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
                {emergencyPickable.length > 0 && (
                  <TextField
                    select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) field.onChange([...field.value, e.target.value]);
                    }}
                    slotProps={{ select: { displayEmpty: true } }}
                  >
                    <MenuItem value="">Add emergency contact…</MenuItem>
                    {emergencyPickable.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.displayName}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </>
            );
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', '& > label': { fontSize: 12, color: 'text.subtle' } }}>
        <Controller
          name="deceased"
          control={control}
          render={({ field }) => (
            <Typography variant="caption" sx={{ color: 'text.secondary' }} component="label">
              <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} /> Deceased
            </Typography>
          )}
        />
        {deceased && (
          <Controller name="deathDate" control={control} render={({ field }) => <TextField type="date" {...field} />} />
        )}
      </Box>

      {errors.root && <Typography variant="body2" component="p" sx={{ my: 0.5, color: 'error.main' }}>{errors.root.message}</Typography>}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outlined" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

import * as Updates from 'expo-updates';

export const UPDATE_ID = Updates.updateId;
export const UPDATE_CHANNEL = Updates.channel;

export const UPDATE_LABEL = !Updates.isEnabled
  ? 'dev'
  : Updates.isEmbeddedLaunch || !Updates.updateId
    ? 'embedded'
    : `OTA ${Updates.updateId.slice(0, 8)}`;

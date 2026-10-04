// Shaping for comms topics, shared by the web pane and (later) the mobile screen.

import { UNTITLED } from './itemLabels';
import { ymd } from './time';

/** comms releases a topic once it goes idle; until then it is still accruing messages. */
export const SETTLED_TOPIC_STATUSES = ['Released'] as const;

export interface TopicLike {
  label: string;
  titled: boolean;
}

export interface TopicMessageLike {
  timestamp: string;
}

export interface MessageDay<T> {
  day: string;
  messages: T[];
}

/** Until the titling pass runs, `label` is the opening message's first few words — quoted, because it
 *  reads as a fragment rather than a name. */
export function topicHeadline(topic: TopicLike): string {
  const label = topic.label.trim();
  if (!label) return UNTITLED;
  return topic.titled ? label : `“${label}”`;
}

/** Consecutive runs of messages sharing a local calendar day, in input order. */
export function groupMessagesByDay<T extends TopicMessageLike>(messages: T[]): MessageDay<T>[] {
  const days: MessageDay<T>[] = [];
  for (const message of messages) {
    const day = ymd(new Date(message.timestamp));
    const last = days[days.length - 1];
    if (last?.day === day) last.messages.push(message);
    else days.push({ day, messages: [message] });
  }
  return days;
}

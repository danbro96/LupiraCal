import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useGetContact } from '@lupira/cal-api/query/contact';
import { useGetTopic } from '@lupira/cal-api/query/comms';
import { groupMessagesByDay, topicHeadline } from '@lupira/cal-domain/topics';
import { fmtDate, fmtDayTitle, fmtDateTime, fmtTime, parseYmd } from '@danbro96/lupira-domain-core/time';
import { useContactTopics } from '../../../state/useContactTopics';
import { errText } from '../../errText';
import { PageHead } from '../Page';
import { Row, RowName } from '../Rows';
import { DetailPane } from './panes';

/** Lazy route: a contact's finished comms topics, and the messages inside one. Reached only from the
 *  contact's Comms link, so neither comms-api nor this chunk is touched on the way to a contact. */
export default function ContactTopicsPane() {
  const { contactId = '', topicId } = useParams();
  return topicId ? <TopicMessages contactId={contactId} topicId={topicId} /> : <TopicList contactId={contactId} />;
}

function TopicList({ contactId }: { contactId: string }) {
  const { search } = useLocation();
  const { data: contact } = useGetContact(contactId, { query: { enabled: !!contactId } });
  const { topics, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useContactTopics(contactId);

  return (
    <DetailPane>
      <BackLink to={{ pathname: `/contacts/${contactId}`, search }}>{contact?.displayName ?? 'Contact'}</BackLink>
      <PageHead>
        <h2>Comms topics</h2>
      </PageHead>

      {isLoading && <Muted>Loading…</Muted>}
      {error && <Muted>{errText(error) ?? 'Could not reach the comms archive.'}</Muted>}
      {!isLoading && !error && topics.length === 0 && (
        <Muted>No finished topics — nothing here until a message sender is bound to this contact.</Muted>
      )}

      {topics.map((topic) => (
        <Row component={Link} key={topic.id} to={{ pathname: `/contacts/${contactId}/topics/${topic.id}`, search }}>
          <RowName>{topicHeadline(topic)}</RowName>
          <Chip variant="outlined" label={topic.messageCount} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {fmtDate(new Date(topic.lastActivity))}
          </Typography>
        </Row>
      ))}

      {hasNextPage && (
        <Button variant="text" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} sx={{ mt: 1 }}>
          {isFetchingNextPage ? 'Loading…' : 'Load older'}
        </Button>
      )}
    </DetailPane>
  );
}

function TopicMessages({ contactId, topicId }: { contactId: string; topicId: string }) {
  const { search } = useLocation();
  const { data: topic, isLoading, error } = useGetTopic(topicId);

  if (isLoading) return <DetailPane><Muted>Loading…</Muted></DetailPane>;
  if (error || !topic)
    return (
      <DetailPane>
        <BackLink to={{ pathname: `/contacts/${contactId}/topics`, search }}>Topics</BackLink>
        <Muted>{errText(error) ?? 'Topic not found.'}</Muted>
      </DetailPane>
    );

  return (
    <DetailPane>
      <BackLink to={{ pathname: `/contacts/${contactId}/topics`, search }}>Topics</BackLink>
      <PageHead>
        <h2>{topicHeadline(topic)}</h2>
        <Chip variant="outlined" label={topic.status} />
      </PageHead>
      <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
        Last activity {fmtDateTime(new Date(topic.lastActivity))} · {topic.messages.length} messages
      </Typography>

      {groupMessagesByDay(topic.messages).map((day) => (
        <Box key={`${day.day}-${day.messages[0].id}`} sx={{ mt: 2 }}>
          <Typography variant="overline" component="h3" sx={{ display: 'block', textAlign: 'center', color: 'text.subtle' }}>
            {fmtDayTitle(parseYmd(day.day))}
          </Typography>
          {day.messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                maxWidth: '85%',
                ml: message.fromPrincipal ? 'auto' : 0,
                mt: 1,
                p: 1,
                borderRadius: 1.5,
                bgcolor: message.fromPrincipal ? 'primary.main' : 'action.hover',
                color: message.fromPrincipal ? 'primary.contrastText' : 'text.primary',
              }}
            >
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.75 }}>
                {message.sender ?? 'Unknown'} · {fmtTime(new Date(message.timestamp))}
              </Typography>
              <Box sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</Box>
            </Box>
          ))}
        </Box>
      ))}
    </DetailPane>
  );
}

function BackLink({ to, children }: { to: { pathname: string; search: string }; children: string }) {
  return (
    <Button variant="text" component={Link} to={to} sx={{ ml: -1 }}>
      ‹ {children}
    </Button>
  );
}

function Muted({ children }: { children: string }) {
  return <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">{children}</Typography>;
}

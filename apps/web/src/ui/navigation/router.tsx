import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import App from '../../App';
import { RequireAuth } from '@danbro96/lupira-web-session/RequireAuth';
import { Centered } from '@danbro96/lupira-web-mui/Centered';
import { AppShell } from '../components/AppShell';
import { CalendarScreen } from '../screens/CalendarScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { ContactsLayout } from './ContactsLayout';
import { EmptyDetail } from '../components/contacts/EmptyDetail';
import { ContactDetailPane } from '../components/contacts/ContactDetailPane';
import { GroupDetailPane } from '../components/contacts/GroupDetailPane';
import { CalendarsScreen } from '../screens/CalendarsScreen';
import Typography from '@mui/material/Typography';
import { Page } from '../components/Page';

// Lazy: keeps the comms client out of the main chunk — a rarely-visited corner of a contact.
const ContactTopicsPane = lazy(() => import('../components/contacts/ContactTopicsPane'));

// Everything requires the SSO session — LupiraCalApi has no anonymous surface. The drawer rides
// the ?item= search param on any route, so occurrences deep-link from every screen.
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        element: <RequireAuth pending={(title) => <Centered title={title} />} />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <CalendarScreen /> },
              { path: 'items', element: <ItemsScreen /> },
              { path: 'inbox', element: <InboxScreen /> },
              {
                path: 'contacts',
                element: <ContactsLayout />,
                children: [
                  { index: true, element: <EmptyDetail /> },
                  { path: 'groups/:groupId', element: <GroupDetailPane /> },
                  { path: ':contactId', element: <ContactDetailPane /> },
                  {
                    path: ':contactId/topics/:topicId?',
                    element: (
                      <Suspense fallback={<Page><Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Loading…</Typography></Page>}>
                        <ContactTopicsPane />
                      </Suspense>
                    ),
                  },
                ],
              },
              { path: 'calendars', element: <CalendarsScreen /> },
              { path: '*', element: <CalendarScreen /> },
            ],
          },
        ],
      },
    ],
  },
]);

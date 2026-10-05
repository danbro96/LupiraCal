import { Navigate, useParams } from 'react-router-dom';

/** `/items/:itemId` is the shareable link (and the app's App Link); the drawer itself rides `?item=`. */
export function ItemLinkRedirect() {
  const { itemId = '' } = useParams();
  return <Navigate replace to={{ pathname: '/items', search: `?item=${encodeURIComponent(itemId)}` }} />;
}

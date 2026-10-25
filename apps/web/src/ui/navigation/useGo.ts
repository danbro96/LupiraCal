import { type To, useNavigate } from 'react-router-dom';

export function useGo(): (to: To) => void {
  const navigate = useNavigate();
  return (to) => {
    Promise.resolve(navigate(to)).catch(reportError);
  };
}

import App from '../App.jsx';

/* Nothing here can be server-rendered usefully — the whole page is driven by
 * window scroll, canvas and WebCodecs — so this route is a thin shell around
 * the client tree. */
export default function Page() {
  return <App />;
}

import { Link, useParams } from 'react-router';

const PAGES = {
  history: ['Version History', 'Commits with author, time and summary, plus a side by side diff of two versions.'],
  compatibility: ['Compatibility Report', 'Every failed check grouped by Error and Warning. Clicking an alert will open the part on the board.'],
  'sub-assemblies': ['Sub-assemblies', 'Save a tested group of parts and import it into another project.'],
  export: ['Export', 'Download the component list as CSV or PDF.'],
  library: ['Component Library', 'Full search with filters, part detail and the Custom Part Creator.'],
  rules: ['Rule Engine', 'Pre-built rules and the custom rule builder.'],
  settings: ['Settings', 'Account profile, notifications, members and roles, audit log, backup and restore.'],
} as const;

export function Soon({ page }: { page: keyof typeof PAGES }) {
  const { id } = useParams();
  const [title, text] = PAGES[page];
  return (
    <section className="ws-page">
      <h1>{title}</h1>
      <p>{text}</p>
      <p className="ws-muted">This page is not built yet.</p>
      <Link className="btn ws-sm" to={id ? `/projects/${id}/bom` : '/dashboard'}>
        {id ? 'Back to the board' : 'Back to projects'}
      </Link>
    </section>
  );
}

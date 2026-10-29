import { BranchIcon, CloudDownIcon, ShieldCheckIcon } from './icons';

const ITEMS = [
  {
    icon: CloudDownIcon,
    title: 'Auto-fetch from Octopart/Nexar',
    body: 'Pull technical specs automatically. No more manual datasheet reading.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Detect Errors Early',
    body: 'Catch voltage and dimension mismatches before assembly.',
  },
  {
    icon: BranchIcon,
    title: 'Track Every Change',
    body: 'Full version control for your BOM. Compare revisions easily.',
  },
];

export function ValueProps() {
  return (
    <section className="values" aria-label="Why ForgeSpec">
      <div className="container values__grid">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <article key={title} className="card">
            <span className="card__icon">
              <Icon />
            </span>
            <h2 className="card__title">{title}</h2>
            <p className="card__body">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

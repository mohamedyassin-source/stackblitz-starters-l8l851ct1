type StampColor = 'green' | 'amber' | 'red' | 'blue' | 'slate';

export default function Stamp({ color, children }: { color: StampColor; children: React.ReactNode }) {
  return <span className={`stamp stamp-${color}`}>{children}</span>;
}

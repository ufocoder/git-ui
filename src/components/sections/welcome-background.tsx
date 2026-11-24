export default function WelcomeBackground() {
  return <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 z-0 opacity-80"
    style={{ background: "linear-gradient(125deg, transparent 6%, hsl(var(--muted-foreground) / 0.12) 30%, transparent 56%, hsl(var(--primary) / 0.14) 125%)" }}
  />;
}

export default function Home() {
  return (
    <main className="app-shell">
      <iframe
        className="converter-frame"
        src="/converter.html?v=vitro-unit-pricing-20261112"
        title="Factory Quote Converter"
        allow="clipboard-write"
      />
    </main>
  );
}

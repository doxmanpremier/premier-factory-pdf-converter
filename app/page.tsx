export default function Home() {
  return (
    <main className="app-shell">
      <iframe
        className="converter-frame"
        src="/converter.html?v=browne-excel-converter-20260903"
        title="Factory Quote Converter"
        allow="clipboard-write"
      />
    </main>
  );
}

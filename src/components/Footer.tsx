/**
 * Tiny footer shown below the playfield: keyboard hints + version.
 */
export function Footer() {
  return (
    <div className="footer">
      <div className="keys">
        <kbd>←</kbd>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <kbd>→</kbd> move
        <span style={{ opacity: 0.5 }}>·</span>
        <kbd>Space</kbd> select
        <span style={{ opacity: 0.5 }}>·</span>
        <kbd>P</kbd> pause
      </div>
      <div>v2.0</div>
    </div>
  );
}

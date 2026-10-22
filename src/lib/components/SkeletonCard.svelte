<div class="sk" aria-hidden="true">
  <div class="img"></div>
  <div class="body">
    <div class="line w60"></div>
    <div class="line w40"></div>
    <div class="line w50"></div>
  </div>
</div>

<style>
  .sk {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);
  }
  .img {
    aspect-ratio: 4 / 3;
    background: var(--skeleton);
  }
  .body {
    padding: 0.8rem;
    display: grid;
    gap: 0.5rem;
  }
  .line {
    height: 0.7rem;
    border-radius: 4px;
    background: var(--skeleton);
  }
  .w60 { width: 60%; }
  .w40 { width: 40%; }
  .w50 { width: 50%; }
  .img, .line {
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  @media (prefers-reduced-motion: reduce) {
    .img, .line { animation: none; }
  }
</style>

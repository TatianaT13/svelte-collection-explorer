<script lang="ts">
  /**
   * Prise de vue guidée : flux caméra plein écran, cadre à remplir, mesures en direct (netteté, exposition, contraste,
   * reflets, objet coupé par le bord) et horizon (capteur d'orientation quand il existe). Le déclencheur reste toujours
   * actif : on conseille, on ne bloque pas. La photo rendue est un JPEG à la résolution du flux.
   * Pourquoi : la mesure de robustesse (README § 16) montre que rotation et cadrage partiel coûtent 13 et 18 points de
   * recall@1, le flou et la compression presque rien. Corriger la prise de vue vaut plus que changer de modèle.
   */
  import { onMount } from 'svelte';
  import { i18n } from '#lib/i18n/index.svelte.ts';
  import { schema } from '#lib/config/schema.ts';
  import { assessPhoto, measureFrame, type QualityIssue } from '#lib/utils/photoQuality.ts';
  import { portal } from '#lib/utils/portal.ts';

  let { onconfirm, oncancel }: { onconfirm: (f: File) => void; oncancel: () => void } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let facing = $state<'environment' | 'user'>('environment');
  let error = $state<string | null>(null);
  let issues = $state<QualityIssue[]>([]);
  let measured = $state(false);
  let tilt = $state<number | null>(null);
  let canFlip = $state(false);
  let timer = 0;

  const maxTilt = schema.photoQuality.maxTilt ?? 6;
  const tilted = $derived(tilt !== null && Math.abs(tilt) > maxTilt);
  const ok = $derived(measured && issues.length === 0 && !tilted);

  async function start() {
    stop();
    error = null;
    measured = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      canFlip = devices.filter((d) => d.kind === 'videoinput').length > 1;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function tick() {
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    const m = measureFrame(video, video.videoWidth, video.videoHeight);
    if (!m) return;
    issues = assessPhoto(m, schema.photoQuality);
    measured = true;
  }

  function onOrientation(e: DeviceOrientationEvent) {
    if (typeof e.gamma === 'number') tilt = Math.round(e.gamma);
  }

  onMount(() => {
    start();
    timer = window.setInterval(tick, 300);
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('deviceorientation', onOrientation);
      stop();
    };
  });

  async function shoot() {
    if (!video || !video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    onconfirm(new File([blob], `prise-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`, { type: 'image/jpeg' }));
  }

  function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    start();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="capture" use:portal role="dialog" aria-modal="true" aria-label={i18n.t('capture.title')}>
  <video bind:this={video} autoplay playsinline muted></video>
  <div class="frame" aria-hidden="true"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>

  <div class="top">
    <h2>{i18n.t('capture.title')}</h2>
    <p>{i18n.t('capture.frameHint')}</p>
  </div>

  {#if error}
    <p class="status error" role="alert">{i18n.t('capture.unavailable')} {error}</p>
  {:else}
    <div class="status" class:ok class:measured role="status" aria-live="polite">
      {#if !measured}
        {i18n.t(stream ? 'capture.measuring' : 'capture.starting')}
      {:else if ok}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        {i18n.t('capture.ok')}
      {:else}
        <ul>
          {#if tilted}<li><b>{i18n.t('capture.tilt', { deg: Math.abs(tilt ?? 0) })}</b> {i18n.t('capture.tilt.advice')}</li>{/if}
          {#each issues.slice(0, 2) as it (it.id)}
            <li><b>{i18n.t(`quality.${it.id}`)}</b> {i18n.t(`quality.${it.id}.advice`)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if tilt !== null}
    <div class="level" class:bad={tilted} aria-hidden="true"><span style="transform: rotate({tilt}deg)"></span></div>
  {/if}

  <div class="actions">
    <button type="button" class="ghost" onclick={oncancel}>{i18n.t('capture.cancel')}</button>
    <button type="button" class="shutter" onclick={shoot} disabled={!!error} aria-label={i18n.t('capture.shutter')}><i></i></button>
    {#if canFlip}
      <button type="button" class="ghost" onclick={flip}>{i18n.t('capture.flip')}</button>
    {:else}
      <span class="spacer"></span>
    {/if}
  </div>
  <p class="why">{i18n.t('capture.why')}</p>
</div>

<style>
  .capture {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #000;
    color: #fff;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .frame {
    position: absolute;
    inset: 14% 8%;
    border: 1px solid rgb(255 255 255 / 0.35);
    border-radius: 10px;
    pointer-events: none;
  }
  .frame i {
    position: absolute;
    width: 26px;
    height: 26px;
    border: 3px solid #fff;
  }
  .frame .tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-radius: 8px 0 0 0; }
  .frame .tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; }
  .frame .bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-radius: 0 0 0 8px; }
  .frame .br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-radius: 0 0 8px 0; }
  .top {
    position: relative;
    padding: 1rem 1.2rem 0;
    text-shadow: 0 1px 6px rgb(0 0 0 / 0.7);
  }
  .top h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .top p {
    margin: 0.2rem 0 0;
    font-size: 0.88rem;
    opacity: 0.9;
  }
  .status {
    position: relative;
    align-self: end;
    justify-self: center;
    margin: 0 1rem 0.8rem;
    padding: 0.55rem 0.9rem;
    border-radius: 999px;
    background: rgb(245 158 11 / 0.92);
    color: #1a1a1a;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: min(92vw, 560px);
  }
  .status.ok {
    background: rgb(15 123 112 / 0.95);
    color: #fff;
  }
  .status.error {
    background: rgb(180 35 24 / 0.95);
    color: #fff;
  }
  .status ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .status li + li {
    margin-top: 0.2rem;
  }
  .level {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 120px;
    height: 2px;
    margin-left: -60px;
    background: rgb(255 255 255 / 0.5);
    pointer-events: none;
  }
  .level span {
    display: block;
    height: 2px;
    background: #0f7b70;
    transform-origin: center;
  }
  .level.bad span {
    background: #f59e0b;
  }
  .actions {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.2rem;
  }
  .ghost {
    justify-self: start;
    padding: 0.5rem 0.9rem;
    border: 1px solid rgb(255 255 255 / 0.5);
    border-radius: 999px;
    background: rgb(0 0 0 / 0.4);
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  .actions .ghost:last-child {
    justify-self: end;
  }
  .shutter {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    border: 4px solid #fff;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .shutter i {
    display: block;
    width: 52px;
    height: 52px;
    margin: 4px;
    border-radius: 50%;
    background: #fff;
  }
  .shutter:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .why {
    position: relative;
    margin: 0;
    padding: 0 1.2rem 0.9rem;
    font-size: 0.72rem;
    opacity: 0.75;
    text-align: center;
  }
</style>

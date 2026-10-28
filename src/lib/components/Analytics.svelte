<script lang="ts">
  /**
   * Compteur de visites optionnel (GoatCounter) : sans cookie, sans identifiant personnel,
   * compte les pages vues avec pays, navigateur et site d'origine. Ne s'active que si
   * VITE_GOATCOUNTER est défini au build (ex. « mon-site.goatcounter.com »).
   * Respecte le signal « Do Not Track » du navigateur.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';

  const host = import.meta.env.VITE_GOATCOUNTER as string | undefined;

  onMount(() => {
    if (!host || navigator.doNotTrack === '1') return;
    const w = window as unknown as { goatcounter?: { count: (o: { path: string }) => void; no_onload?: boolean } };
    w.goatcounter = { no_onload: true, count: () => {} };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${host}/count`;
    s.onload = () => w.goatcounter?.count({ path: location.pathname + location.search });
    document.head.appendChild(s);
  });

  // Une page vue par navigation interne (application monopage).
  let last = '';
  $effect(() => {
    const path = page.url.pathname + page.url.search;
    if (!host || path === last) return;
    const w = window as unknown as { goatcounter?: { count: (o: { path: string }) => void } };
    if (last && w.goatcounter?.count) w.goatcounter.count({ path });
    last = path;
  });
</script>

/**
 * Action Svelte : déplace l'élément sous <body> au montage et le retire à la destruction.
 * Pour les surcouches en position fixe (volet de détail, prise de vue guidée) : un ancêtre avec transform, filtre ou
 * défilement peut devenir leur repère et les enfermer dans une colonne (vu dans Safari). Sous <body>, aucun ancêtre.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}

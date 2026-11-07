import { Icon } from "./Icon";

// Glyphs are plain SVG, no package. To use an icon package instead, list it in iconPackages and
// re-export its icons from ./index.ts: this folder stays the only place it is imported.
export const IconCheck = (props: { label?: string }) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const IconX = (props: { label?: string }) => (
  <Icon {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

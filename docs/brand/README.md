# Sutra Brand Reference

[`sutra-brand-board.png`](./sutra-brand-board.png) is the contributor-facing
visual reference for Sutra's positioning, palette, typography, thread motif,
product style, and brand voice.

It is documentation, not the source used to generate application icons. The
canonical production masters remain:

- [`sutra-app-icon-master.png`](../../assets/brand/sutra/sutra-app-icon-master.png)
- [`sutra-assistant-icon-master.png`](../../assets/brand/sutra/sutra-assistant-icon-master.png)

The Assistant runtime derivatives are generated from the transparent
[`sutra-assistant-avatar-master.png`](../../assets/brand/sutra/sutra-assistant-avatar-master.png),
extracted from the approved Assistant logo. The original logo master remains
intact. Rerun `scripts/generate-sutra-brand-assets.py` to regenerate icon sizes.

Keep the board under `docs/brand/` so it remains available to contributors
without entering Sutra's allowlisted production deploy artifact.

### Assistant cutout provenance

Created with built-in imagegen from `sutra-assistant-icon-master.png`, with
transparent output requested. Prompt:

> Use case: background-extraction. Edit target: supplied Sutra Assistant logo. Extract ONLY the entire cyan/blue/purple ribbon character including its pale face and two blue pill eyes, remove the surrounding off-white background and floor shadow completely to genuine transparency. Preserve exact character silhouette, ribbon shape, colors, shading, face, and eye positions. No mouth, no additional eyes, no redesign, no text. Center the cutout in a square canvas with modest 8% transparent padding so it can float as a UI avatar. Output a clean transparent PNG.

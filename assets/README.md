# Assets

| Folder | Contents and ownership |
|---|---|
| `brand/sutra/` | Original app and Assistant icon masters. |
| `brand/sutra/generated/` | Runtime icons, favicon, and social preview produced by `scripts/generate-sutra-brand-assets.py`; do not edit outputs manually. |
| `marketing/screenshots/` | Landing-page screenshots; `scripts/capture-final.mjs` owns capture. Keep private workspace material out of captures. |
| `vendor/` | Local runtime libraries, fonts, and licenses. Update the dependency inventory when upgrading. |
| `logos/` | Retained compatibility logo paths used by legacy references and the brand generator. |
| `legacy/` | Retained legacy artwork. Check historical app consumers before moving or deleting. |

Keep application source in `src/` and styles in `styles/`. Asset moves must
update HTML/CSS references, capture/generation scripts, and deployment policy
as applicable. Regenerate the asset manifest and cache-stamp lock afterward.
The production artifact includes generated brand assets, vendor dependencies,
and marketing screenshots; masters and contributor guides remain excluded.

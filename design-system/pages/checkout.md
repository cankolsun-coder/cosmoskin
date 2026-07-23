# Checkout — Overrides on MASTER

**Job of this page:** get a trusting buyer through payment with zero friction and zero surprises. Focus over editorial. Every element either advances the purchase or reassures — nothing else earns its place.

**Inherits:** all tokens, fonts, palette, motion, a11y from `../MASTER.md`. Deviations below only.

## Deviations from MASTER

### Density — tighter, not spacious
- Checkout is the one place to **reduce** the spacious rhythm. Use the tighter end of the scale (section gaps `24–48px`, not `64–128px`) so the full flow feels short and the primary action is always near.
- Single focused column on mobile; two-column on desktop (form left, sticky **order summary** right). Summary stays visible while scrolling (`position: sticky`).

### Type — dial down the editorial
- Lead with **sans (Plus Jakarta Sans)**, not serif. Serif is reserved for the step title / order-complete headline only; keep display sizes modest (`clamp(28px, 3vw, 40px)` max) so it reads as "utility, handled with care," not "magazine."
- Prices and totals: sans 600, tabular feel, high contrast (`--text`). The grand total is the largest number on the page.

### Motion — even more restrained
- Existing step transitions (`StepEnter`/`StepArrive`, ~.45–.55s ease `cubic-bezier(.22,1,…)`) are the ceiling — do not add reveal animations on form fields. Fields appear instantly; motion belongs to step changes only.
- Never animate totals recalculating in a way that hides the number. If a total updates, it changes cleanly, no count-up.

### Components
- **Stepper:** linear, numbered, current step obvious; completed steps show a check + stay tappable to go back. Step number must stay readable (existing contract). Progress is always visible.
- **Primary CTA ("Ödemeye geç" / "Siparişi tamamla"):** ink fill on ivory, full-width on mobile, ≥44px, wide-tracked uppercase. Exactly one primary action per step. Disable + show progress during async submit (`loading-buttons`) — never let a double-tap double-charge.
- **Order summary:** `--card` surface, hairline divider between line items, muted labels / ink values. Sale = current bold + compare-at struck muted. Shipping, tax, discount all itemized **before** the CTA — no cost revealed after.
- **Inputs:** 16px min (no iOS zoom), real `<label for>`, inline error adjacent to the field (icon + text, not color alone). Autocomplete attributes set. Never enter payment/card data on the user's behalf.
- **Trust row:** quiet, near the CTA — secure-payment mark, return policy, authenticity. Thin-stroke SVG, muted. Reassure, don't shout.

### Conversion rules
- No fabricated urgency/scarcity. Real stock warnings only.
- Coupon field present but visually subordinate (collapsed link, not a loud box) so it doesn't invite abandonment-hunting.
- Persist cart + entered fields across refresh; a reload must not lose progress.
- Guest vs. account choice offered without a wall.

## Do NOT
- Introduce new colors/fonts/radii outside MASTER.
- Make the CTA gold-filled.
- Add editorial imagery, hero blocks, or product storytelling here.
- Surprise the buyer with any cost after the summary.

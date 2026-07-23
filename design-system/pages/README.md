# Page-Specific Overrides

Files here override `../MASTER.md` **for one page only**. If no file exists for a page, use MASTER exclusively.

**Rule:** an override may adjust *density, section order, or component emphasis* for a page's job (e.g. checkout is more focused, PDP is more editorial). It may **not** introduce new fonts, colors, radii, or shadows outside MASTER's token set. Keep visual variance low.

Create as `design-system/pages/<page>.md`, e.g. `checkout.md`, `pdp.md`, `home.md`, `collection.md`, `account.md`, `routines.md`. Suggested skeleton:

```md
# <Page> — Overrides on MASTER

**Job of this page:** <one line>
**Deviations from MASTER:** <only what differs, with why>
**Everything else:** inherits MASTER.
```

# COSMOSKIN Route Loop Fix — 2026-05-16D

## Fixed
- Removed the bidirectional redirect loop between `/account/routines.html` and `/account/routines.html`.
- Removed the extra `/account/routines.html` directory route to prevent server-level trailing-slash conflicts.
- Kept one stable clean route: `/account/routines.html` internally serves `/account/routines.html` with a 200 rewrite.
- Updated Rutinler navigation and homepage routine CTA targets to `/account/routines.html`.
- Updated the route bridge so clicks land on the clean working route without bouncing between URLs.

## Expected result
- Visiting `https://www.cosmoskin.com.tr/account/routines.html` opens the Rutinler welcome/dashboard page.
- No `ERR_TOO_MANY_REDIRECTS`.
- Legacy `/account/routines.html`, `/account/routines.html`, and account routine routes redirect to the same stable route.

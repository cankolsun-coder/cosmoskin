# COSMOSKIN Route Loop Fix — 2026-05-16D

## Fixed
- Removed the bidirectional redirect loop between `/collections/routine.html` and `/collections/routine`.
- Removed the extra `/collections/routine/` directory route to prevent server-level trailing-slash conflicts.
- Kept one stable clean route: `/collections/routine` internally serves `/collections/routine.html` with a 200 rewrite.
- Updated Rutinler navigation and homepage routine CTA targets to `/collections/routine`.
- Updated the route bridge so clicks land on the clean working route without bouncing between URLs.

## Expected result
- Visiting `https://www.cosmoskin.com.tr/collections/routine` opens the Rutinler welcome/dashboard page.
- No `ERR_TOO_MANY_REDIRECTS`.
- Legacy `/rutinler`, `/rutinler.html`, and account routine routes redirect to the same stable route.

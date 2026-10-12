# CM-0018 — Sign-in photos and a direct first run

- Status: accepted
- Date: 2026-10-12
- Tickets: CM-103 (sign-in, Choose Company), CM-105 (Create Company), CM-109 (Join Requests)

The sign-in and sign-up screens showed a blueprint grid on the night colour. A new User with no Company landed on "Get started", a page whose main control was a Create a Company button. CM-103's "done when" already said such a User lands on Create Company, so that extra page was drift from the spec. The owner asked for site photos on the brand panel and for the extra page to go.

## Decisions

1. **Ten site photos from Unsplash, one picked at random per visit.** The server picks the photo (`pickAuthPhoto()`, with `connection()` in the public layout), so the first paint already has it and nothing flashes. A client navigation between Sign in and Sign up keeps the same photo, because the layout does not re-render.
2. **The photos are stored in the repo** (`components/auth/photos/`, WebP, 1600 px wide, about 3.3 MB in total), not loaded from images.unsplash.com. Sign-in never waits on a third party, and `next/image` serves each screen the size it needs, with a blur placeholder. Every photo is under the Unsplash License, not Unsplash+.
3. **Each photo carries a small credit** ("Photo by … on Unsplash"), linked with the referral UTM parameters Unsplash asks for. The licence does not require a credit; the owner chose to show one.
4. **No Company → Create Company, directly.** `/continue` sends a User with no Company to `/create-company`. If such a User opens `/choose-company`, it redirects to `/create-company` too. One Company still goes straight in, and several still show Choose Company, unchanged apart from its Create a Company button, which is now always the outline variant.
5. **Create Company uses the sign-in layout:** the photo panel on the left and the wizard on the right, with Sign out in the corner. Below `lg` the photo is hidden, as on sign-in.
6. **Pending Join Requests show above the wizard,** followed by an "or" divider, so an invited Team Member can accept instead of creating a Company. With no requests the page is only the wizard; while the requests load nothing is shown (`QuerySuspense fallback={null}`), so the wizard does not jump.

## Considered

- **Hotlinking images.unsplash.com.** This would commit nothing, but sign-in would depend on Unsplash being up and the page would need `remotePatterns`. Rejected.
- **Sending invited Users to the old "Get started" page.** This keeps two first-run screens. Rejected: the requests fit above the wizard.
- **Picking the photo in the browser.** The server render would show one photo and hydration would swap it for another. Rejected.

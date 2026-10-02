<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Product and receipt uploads use img402's public keyless upload endpoint; existing hosted URLs remain untouched to avoid breaking catalog media.

- Image uploads go to ImgBB via `src/lib/uploads.ts`; old Cloudinary URLs are mapped in `src/lib/image-map.ts` so legacy data keeps rendering.
- Wallet-order delivery happens only inside the site (no WhatsApp): checkout and the buyer's orders page call /api/deliver (Netlify fn, relays to the hosted /api/public/deliver when FIREBASE_DB_SECRET is unset) then the hosted endpoint directly — buyers never wait for manual approval and the store owner needs no server setup.

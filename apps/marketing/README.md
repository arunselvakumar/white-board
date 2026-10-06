# Marketing Site

The public site for Whiteboard. It has no Session; "Sign in" and "Create your Workspace" are plain links into Whiteboard at `/app/login` and `/app/signup`.

```sh
bun run dev --filter=marketing
```

Runs on [http://localhost:3001](http://localhost:3001).

- Design brief, tokens, copy voice, and motion budget: [`DESIGN.md`](./DESIGN.md)
- Sections live in `components/`; the page composes them in `app/page.tsx`
- Animation is GSAP 3 with `@gsap/react`; import only from `lib/gsap.ts`, which registers the plugins once

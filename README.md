# Longhand

A small math problem solver that runs entirely in the browser. Type a
problem, get it worked out — arithmetic, algebra, equations, derivatives,
integrals, and plots.

No backend, no build step, no dependencies beyond a single CDN-hosted
copy of [math.js](https://mathjs.org). Open `index.html`, or host it on
GitHub Pages.

## What it handles

- **Arithmetic** — any expression with `+ - * / ^ ()`, e.g. `(14*3 - 7)/5`
- **Equations** — `2x + 5 = 17`, `3x^2 - 12x + 9 = 0`. Linear and quadratic
  equations are solved algebraically with the steps shown; higher-degree
  or non-polynomial equations (`sin(x) = 0.5`) fall back to a numeric
  root search
- **Simplifying** — `simplify 2(x+3) - 4x`
- **Derivatives** — `derivative of x^3 - 4x + 1`
- **Integrals** — `integrate x^2` (symbolic, polynomials only) or
  `integrate x^2 from 0 to 3` (definite; numeric for non-polynomials)
- **Plots** — `plot sin(x) * x`

It's scoped honestly: single-variable algebra and first-year calculus,
not proofs, word problems, or multivariable systems.

## Running it locally

Just open `index.html` in a browser — there's nothing to build. If your
browser blocks local file scripts, serve the folder instead:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repo.
2. In the repo settings, under **Pages**, set the source to the branch
   and root folder these files live in.
3. GitHub will publish it at `https://<username>.github.io/<repo>/`.

## How it works

`script.js` parses the input to figure out the kind of problem (equation,
derivative, integral, plot, or plain expression), then leans on math.js
for parsing, symbolic differentiation, and simplification. Equation
solving pulls polynomial coefficients out with `math.rationalize` and
applies the linear/quadratic formula directly; anything it can't solve
symbolically falls back to a bisection-based numeric root search.
Integration is done term-by-term for polynomials (power rule) and with
Simpson's rule numerically otherwise.

## License

MIT — do whatever you'd like with it.

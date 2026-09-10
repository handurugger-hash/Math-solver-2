/* Longhand — a small client-side math solver built on math.js
   Scope, on purpose: arithmetic, algebra, single-variable equations,
   derivatives, polynomial/definite integrals, and function plots.
   No backend, nothing leaves the browser. */

(function () {
  "use strict";

  const CONSTANTS = new Set(["e", "pi", "i", "Infinity", "NaN", "true", "false"]);

  const SIMPLIFY_RULES = math.simplify.rules.concat([
    "n1*(n2+n3) -> n1*n2 + n1*n3",
    "(n2+n3)*n1 -> n2*n1 + n3*n1",
    "n1*(n2-n3) -> n1*n2 - n1*n3",
    "(n2-n3)*n1 -> n2*n1 - n3*n1",
  ]);

  // ---------- helpers ----------

  function extractVariables(exprString) {
    const vars = new Set();
    const node = math.parse(exprString);
    node.traverse((n, path, parent) => {
      if (n.type === "SymbolNode") {
        if (parent && parent.type === "FunctionNode" && path === "fn") return;
        if (!CONSTANTS.has(n.name)) vars.add(n.name);
      }
    });
    return Array.from(vars);
  }

  function niceNumber(value) {
    if (typeof value !== "number") return String(value);
    if (Number.isInteger(value)) return String(value);
    const rounded = Math.round(value * 1e8) / 1e8;
    if (Number.isInteger(rounded)) return String(rounded);
    return math.format(rounded, { precision: 6 });
  }

  function simplifyStr(exprString) {
    return math.simplify(exprString, SIMPLIFY_RULES).toString({ implicit: "hide" });
  }

  function prettyStr(exprString) {
    return math.parse(exprString).toString({ implicit: "hide" });
  }

  function evalPoly(coeffs, x) {
    // coeffs ascending by power
    let sum = 0;
    for (let p = coeffs.length - 1; p >= 0; p--) sum = sum * x + coeffs[p];
    return sum;
  }

  function formatPoly(coeffs, variable) {
    // coeffs ascending by power, build a readable expression string
    let terms = [];
    for (let p = coeffs.length - 1; p >= 0; p--) {
      const c = coeffs[p];
      if (Math.abs(c) < 1e-12) continue;
      let term;
      if (p === 0) term = niceNumber(c);
      else if (p === 1) term = `${niceNumber(c)}*${variable}`;
      else term = `${niceNumber(c)}*${variable}^${p}`;
      terms.push({ c, term });
    }
    if (terms.length === 0) return "0";
    let out = terms[0].c < 0 ? `-${terms[0].term.replace(/^-/, "")}` : terms[0].term;
    for (let i = 1; i < terms.length; i++) {
      out += terms[i].c < 0 ? ` - ${terms[i].term.replace(/^-/, "")}` : ` + ${terms[i].term}`;
    }
    return out;
  }

  // ---------- numeric root finding (fallback for non-polynomial / high degree) ----------

  function findRootsNumeric(f, lo, hi, steps) {
    const N = 4000;
    const dx = (hi - lo) / N;
    const roots = [];
    let prevX = lo;
    let prevY = safeEval(f, prevX);

    for (let i = 1; i <= N; i++) {
      const x = lo + i * dx;
      const y = safeEval(f, x);
      if (prevY !== null && y !== null) {
        if (prevY === 0) {
          roots.push(prevX);
        } else if (prevY * y < 0) {
          roots.push(bisect(f, prevX, x));
        }
      }
      prevX = x;
      prevY = y;
    }
    // dedupe close roots
    roots.sort((a, b) => a - b);
    const deduped = [];
    for (const r of roots) {
      if (deduped.length === 0 || Math.abs(r - deduped[deduped.length - 1]) > 1e-6) {
        deduped.push(Math.round(r * 1e8) / 1e8);
      }
    }
    return deduped;
  }

  function safeEval(f, x) {
    try {
      const y = f.evaluate({ x });
      return typeof y === "number" && isFinite(y) ? y : null;
    } catch (e) {
      return null;
    }
  }

  function bisect(f, a, b) {
    let fa = safeEval(f, a);
    for (let i = 0; i < 60; i++) {
      const m = (a + b) / 2;
      const fm = safeEval(f, m);
      if (fm === null) break;
      if (fa !== null && fa * fm <= 0) {
        b = m;
      } else {
        a = m;
        fa = fm;
      }
    }
    return (a + b) / 2;
  }

  // ---------- intent handlers ----------

  function handleEquation(input) {
    const parts = input.split("=");
    if (parts.length !== 2) {
      throw new Error("An equation needs exactly one \"=\" sign.");
    }
    const [lhsRaw, rhsRaw] = parts.map((s) => s.trim());
    const diffExpr = `(${lhsRaw}) - (${rhsRaw})`;

    const vars = extractVariables(diffExpr).filter((v) => v !== "x" || true);
    if (vars.length > 1) {
      throw new Error(
        `That equation has more than one unknown (${vars.join(", ")}). Longhand solves for a single variable at a time.`
      );
    }

    const steps = [];
    const parsed = `${prettyStr(lhsRaw)} = ${prettyStr(rhsRaw)}`;

    if (vars.length === 0) {
      const value = math.evaluate(diffExpr);
      const answer = Math.abs(value) < 1e-9 ? "True for all values — every number is a solution." : "No solution — this is never true.";
      return { parsed, steps, answer };
    }

    const variable = vars[0];

    let coeffs = null;
    try {
      const rat = math.rationalize(diffExpr, {}, true);
      if (rat.variables.length <= 1) coeffs = rat.coefficients;
    } catch (e) {
      coeffs = null;
    }

    if (coeffs) {
      // trim any zero leading terms so degree reflects the real polynomial
      while (coeffs.length > 1 && Math.abs(coeffs[coeffs.length - 1]) < 1e-12) coeffs.pop();
      steps.push(`Move everything to one side: ${formatPoly(coeffs, variable)} = 0`);
      const degree = coeffs.length - 1;

      if (degree <= 0) {
        const c = coeffs[0] || 0;
        const answer = Math.abs(c) < 1e-9 ? "True for all values — every number is a solution." : "No solution — this is never true.";
        return { parsed, steps, answer };
      }

      if (degree === 1) {
        const [b, a] = coeffs; // a*x + b = 0
        steps.push(`This is linear: ${niceNumber(a)}${variable} + ${niceNumber(b)} = 0`);
        const x = -b / a;
        steps.push(`Isolate ${variable}: ${variable} = ${niceNumber(-b)} / ${niceNumber(a)}`);
        return { parsed, steps, answer: `${variable} = ${niceNumber(x)}` };
      }

      if (degree === 2) {
        const [c, b, a] = coeffs; // a*x^2 + b*x + c = 0
        steps.push(`This is quadratic: ${niceNumber(a)}${variable}² + ${niceNumber(b)}${variable} + ${niceNumber(c)} = 0`);
        const disc = b * b - 4 * a * c;
        steps.push(`Discriminant: b² − 4ac = ${niceNumber(disc)}`);
        if (disc > 1e-12) {
          const r1 = (-b + Math.sqrt(disc)) / (2 * a);
          const r2 = (-b - Math.sqrt(disc)) / (2 * a);
          steps.push(`Quadratic formula: ${variable} = (−b ± √(b² − 4ac)) / 2a`);
          return {
            parsed,
            steps,
            answer: `${variable} = ${niceNumber(r1)}  or  ${variable} = ${niceNumber(r2)}`,
          };
        } else if (Math.abs(disc) <= 1e-12) {
          const r = -b / (2 * a);
          steps.push(`Discriminant is 0, so there's a single repeated root.`);
          return { parsed, steps, answer: `${variable} = ${niceNumber(r)}` };
        } else {
          const re = -b / (2 * a);
          const im = Math.sqrt(-disc) / (2 * a);
          steps.push(`Discriminant is negative — no real solutions, two complex ones.`);
          return {
            parsed,
            steps,
            answer: `${variable} = ${niceNumber(re)} ± ${niceNumber(im)}i`,
          };
        }
      }

      // degree >= 3: numeric, but we know it's polynomial so scan a generous range
      steps.push(`Degree ${degree} polynomial — solving numerically for real roots.`);
      const f = math.compile(diffExpr);
      const roots = findRootsNumeric(f, -50, 50);
      if (roots.length === 0) {
        return { parsed, steps, answer: "No real roots found in the range searched." };
      }
      return {
        parsed,
        steps,
        answer: `${variable} = ` + roots.map(niceNumber).join(", "),
      };
    }

    // not a polynomial (trig, exp, log, etc.) — numeric root search
    steps.push(`Move everything to one side: ${prettyStr(diffExpr)} = 0`);
    steps.push("Not a polynomial in a form Longhand solves symbolically — searching numerically instead.");
    const searchRange = 15;
    const f = math.compile(diffExpr);
    const roots = findRootsNumeric(f, -searchRange, searchRange);
    if (roots.length === 0) {
      throw new Error(`Couldn't find a real solution by scanning ${variable} from −${searchRange} to ${searchRange}. It may have no real root, or one outside that range.`);
    }
    return {
      parsed,
      steps,
      answer: `${variable} ≈ ` + roots.map(niceNumber).join(", "),
    };
  }

  function handleDerivative(exprStr) {
    const vars = extractVariables(exprStr);
    const variable = vars[0] || "x";
    const derivativeNode = math.derivative(exprStr, variable);
    const raw = derivativeNode.toString({ implicit: "hide" });
    const simplified = simplifyStr(raw);
    return {
      parsed: `d/d${variable} [ ${prettyStr(exprStr)} ]`,
      steps: [`Differentiate term by term with respect to ${variable}.`],
      answer: simplified,
    };
  }

  function handleIntegral(rest) {
    const boundsMatch = rest.match(/^(.*?)\s+from\s+(.+?)\s+to\s+(.+)$/i);
    let exprStr = rest.trim();
    let a = null, b = null;

    if (boundsMatch) {
      exprStr = boundsMatch[1].trim();
      a = math.evaluate(boundsMatch[2].trim());
      b = math.evaluate(boundsMatch[3].trim());
    }

    const vars = extractVariables(exprStr);
    const variable = vars[0] || "x";
    const steps = [];

    let coeffs = null;
    try {
      const rat = math.rationalize(exprStr, {}, true);
      if (rat.variables.length <= 1) coeffs = rat.coefficients;
    } catch (e) {
      coeffs = null;
    }

    if (coeffs) {
      steps.push("Polynomial — integrating term by term (power rule: ∫xⁿ = xⁿ⁺¹/(n+1)).");
      const antiCoeffs = [0];
      for (let p = 0; p < coeffs.length; p++) {
        antiCoeffs[p + 1] = coeffs[p] / (p + 1);
      }
      const antiderivativeStr = formatPoly(antiCoeffs, variable);

      if (a !== null && b !== null) {
        const valB = evalPoly(antiCoeffs, b);
        const valA = evalPoly(antiCoeffs, a);
        steps.push(`Antiderivative: F(${variable}) = ${antiderivativeStr}`);
        steps.push(`Evaluate F(${niceNumber(b)}) − F(${niceNumber(a)}).`);
        return {
          parsed: `∫ ${prettyStr(exprStr)} d${variable}, from ${niceNumber(a)} to ${niceNumber(b)}`,
          steps,
          answer: niceNumber(valB - valA),
        };
      }
      return {
        parsed: `∫ ${prettyStr(exprStr)} d${variable}`,
        steps,
        answer: `${antiderivativeStr} + C`,
      };
    }

    // not a polynomial — needs bounds for a numeric result
    if (a === null || b === null) {
      throw new Error(
        `Symbolic integration only covers polynomials right now. Give bounds — e.g. "integrate ${exprStr} from 0 to 1" — for a numeric definite integral instead.`
      );
    }

    steps.push("Not a polynomial — estimating numerically with Simpson's rule.");
    const f = math.compile(exprStr);
    const n = 1000;
    const h = (b - a) / n;
    let sum = safeEval(f, a) + safeEval(f, b);
    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      const y = safeEval(f, x);
      sum += (i % 2 === 0 ? 2 : 4) * (y === null ? 0 : y);
    }
    const result = (h / 3) * sum;
    return {
      parsed: `∫ ${prettyStr(exprStr)} d${variable}, from ${niceNumber(a)} to ${niceNumber(b)}`,
      steps,
      answer: `≈ ${niceNumber(result)}`,
    };
  }

  function handleSimplify(exprStr) {
    return {
      parsed: exprStr.trim(),
      steps: [],
      answer: simplifyStr(exprStr),
    };
  }

  function handlePlain(exprStr) {
    const vars = extractVariables(exprStr);
    if (vars.length === 0) {
      const value = math.evaluate(exprStr);
      return { parsed: exprStr.trim(), steps: [], answer: niceNumber(value) };
    }
    return {
      parsed: exprStr.trim(),
      steps: ["No \"=\" sign, so treating this as an expression to simplify."],
      answer: simplifyStr(exprStr),
    };
  }

  function handlePlot(exprStr) {
    const vars = extractVariables(exprStr);
    const variable = vars[0] || "x";
    const f = math.compile(exprStr);
    return {
      parsed: `plot: y = ${prettyStr(exprStr)}`,
      steps: [],
      answer: `Plotted over ${variable} ∈ [−10, 10]`,
      plot: { f, variable },
    };
  }

  // ---------- intent detection ----------

  function solve(rawInput) {
    const input = rawInput.trim();
    if (!input) throw new Error("Type something to solve.");

    let m;

    if ((m = input.match(/^(?:plot|graph)\s+(.+)$/i))) {
      return handlePlot(m[1]);
    }
    if ((m = input.match(/^(?:derivative of|differentiate)\s+(.+)$/i))) {
      return handleDerivative(m[1]);
    }
    if ((m = input.match(/^d\s*\/\s*d([a-zA-Z])\s*(?:of)?\s*\[?(.+?)\]?$/i))) {
      return handleDerivative(m[2]);
    }
    if ((m = input.match(/^(?:integrate|∫)\s+(.+)$/i))) {
      return handleIntegral(m[1]);
    }
    if ((m = input.match(/^simplify\s+(.+)$/i))) {
      return handleSimplify(m[1]);
    }
    if (input.includes("=")) {
      return handleEquation(input);
    }
    return handlePlain(input);
  }

  // ---------- plotting ----------

  function drawPlot(canvas, f, variable) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const xMin = -10, xMax = 10;
    const samples = [];
    for (let i = 0; i <= 400; i++) {
      const x = xMin + (i / 400) * (xMax - xMin);
      const y = safeEval(f, x);
      samples.push([x, y]);
    }
    const finiteYs = samples.map((s) => s[1]).filter((y) => y !== null);
    let yMin = Math.min(...finiteYs, -1);
    let yMax = Math.max(...finiteYs, 1);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.1;
    yMin -= yPad; yMax += yPad;

    const toPx = (x, y) => [
      ((x - xMin) / (xMax - xMin)) * w,
      h - ((y - yMin) / (yMax - yMin)) * h,
    ];

    // grid + axes
    ctx.strokeStyle = "#e2e6ea";
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(xMin); gx <= xMax; gx++) {
      const [px] = toPx(gx, 0);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    const gridStepY = Math.max(1, Math.round((yMax - yMin) / 10));
    for (let gy = Math.ceil(yMin); gy <= yMax; gy += gridStepY) {
      const [, py] = toPx(0, gy);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }

    ctx.strokeStyle = "#1c2430";
    ctx.lineWidth = 1.5;
    if (xMin <= 0 && 0 <= xMax) {
      const [px0] = toPx(0, 0);
      ctx.beginPath(); ctx.moveTo(px0, 0); ctx.lineTo(px0, h); ctx.stroke();
    }
    if (yMin <= 0 && 0 <= yMax) {
      const [, py0] = toPx(0, 0);
      ctx.beginPath(); ctx.moveTo(0, py0); ctx.lineTo(w, py0); ctx.stroke();
    }

    // curve
    ctx.strokeStyle = "#33418f";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let drawing = false;
    for (const [x, y] of samples) {
      if (y === null || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) {
        drawing = false;
        continue;
      }
      const [px, py] = toPx(x, y);
      if (!drawing) { ctx.moveTo(px, py); drawing = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // ---------- UI wiring ----------

  const form = document.getElementById("solve-form");
  const input = document.getElementById("problem-input");
  const resultSection = document.getElementById("result-section");
  const errorSection = document.getElementById("error-section");
  const resultParsed = document.getElementById("result-parsed");
  const resultSteps = document.getElementById("result-steps");
  const resultAnswer = document.getElementById("result-answer");
  const resultPlot = document.getElementById("result-plot");
  const errorMessage = document.getElementById("error-message");

  function render(result) {
    errorSection.hidden = true;
    resultSection.hidden = false;
    resultParsed.textContent = result.parsed;
    resultSteps.innerHTML = "";
    result.steps.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      resultSteps.appendChild(li);
    });
    resultAnswer.textContent = result.answer;

    if (result.plot) {
      resultPlot.hidden = false;
      drawPlot(resultPlot, result.plot.f, result.plot.variable);
    } else {
      resultPlot.hidden = true;
    }
  }

  function renderError(message) {
    resultSection.hidden = true;
    errorSection.hidden = false;
    errorMessage.textContent = message;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value;
    try {
      const result = solve(value);
      render(result);
    } catch (err) {
      renderError(err.message || "Something about that expression didn't parse.");
    }
  });

  document.getElementById("examples").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    input.value = btn.dataset.ex;
    form.requestSubmit();
  });
})();

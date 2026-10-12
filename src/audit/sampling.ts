/**
 * Attribute-sampling aid based on the Poisson reliability factor used in
 * audit sampling tables. The factor is the `confidence` quantile of a gamma
 * distribution with shape = deviations + 1 (equivalently, a chi-square
 * quantile divided by two). Sample size is factor / tolerable deviation rate,
 * then a finite-population correction.
 *
 * This plans and evaluates a sample. It does not replace a firm's sampling
 * manual, and a statistical pass does not excuse a deviation that shows the
 * control failed.
 */

export interface SamplePlanInput {
  populationSize: number;
  confidence: number;
  tolerableRate: number;
  expectedDeviations: number;
}

export interface SamplePlan {
  populationSize: number;
  confidence: number;
  tolerableRate: number;
  expectedDeviations: number;
  reliabilityFactor: number;
  unadjustedSampleSize: number;
  sampleSize: number;
  finitePopulationAdjusted: boolean;
  fullPopulation: boolean;
  narrative: string;
}

export interface SampleEvaluationInput {
  populationSize: number;
  sampleSize: number;
  exceptionsFound: number;
  confidence: number;
  tolerableRate: number;
}

export interface SampleEvaluation {
  populationSize: number;
  sampleSize: number;
  exceptionsFound: number;
  confidence: number;
  tolerableRate: number;
  reliabilityFactor: number | null;
  upperDeviationRate: number;
  observedRate: number;
  statisticalSupport: boolean;
  fullPopulation: boolean;
  narrative: string;
}

export interface RiskPreset {
  confidence: number;
  tolerableRate: number;
  expectedDeviations: number;
  note: string;
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843696540789e-6,
  1.5056327351493116e-7,
];

function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  let x = LANCZOS[0];
  const shifted = z - 1;
  for (let i = 1; i < LANCZOS.length; i += 1) {
    x += LANCZOS[i] / (shifted + i);
  }
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Lower regularized gamma P(s, x). */
function gammaP(shape: number, x: number): number {
  if (x === 0) return 0;
  if (x < shape + 1) {
    let term = 1 / shape;
    let sum = term;
    for (let n = 1; n < 300; n += 1) {
      term *= x / (shape + n);
      sum += term;
      if (term < sum * 1e-14) break;
    }
    return sum * Math.exp(-x + shape * Math.log(x) - logGamma(shape));
  }
  return 1 - gammaQ(shape, x);
}

function gammaQ(shape: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - shape;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 300; i += 1) {
    const an = -i * (i - shape);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return Math.exp(-x + shape * Math.log(x) - logGamma(shape)) * h;
}

function gammaQuantile(probability: number, shape: number): number {
  let lo = 0;
  let hi = Math.max(1, shape);
  while (gammaP(shape, hi) < probability) {
    hi *= 2;
    if (hi > 1e6) {
      throw new Error("Reliability factor did not converge.");
    }
  }
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (gammaP(shape, mid) < probability) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function reliabilityFactor(deviations: number, confidence: number): number {
  if (!Number.isInteger(deviations) || deviations < 0 || deviations > 10) {
    throw new Error("Deviations must be a whole number from 0 to 10.");
  }
  if (!(confidence > 0 && confidence < 1)) {
    throw new Error("Confidence must be between 0 and 1.");
  }
  if (deviations === 0) return -Math.log(1 - confidence);
  return gammaQuantile(confidence, deviations + 1);
}

function requirePositiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of at least 1.`);
  }
  return value;
}

function requireRate(value: number, label: string): number {
  if (!(value > 0 && value < 1)) {
    throw new Error(`${label} must be greater than 0 and less than 100%.`);
  }
  return value;
}

function requireConfidence(value: number): number {
  if (![0.9, 0.95, 0.99].some((item) => Object.is(item, value))) {
    throw new Error("Confidence must be 90%, 95%, or 99%.");
  }
  return value;
}

export function formatPercent(rate: number): string {
  const percent = Math.round(rate * 1000) / 10;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function deviationWord(count: number): string {
  return count === 1 ? "deviation" : "deviations";
}

export function planSample(input: SamplePlanInput): SamplePlan {
  const populationSize = requirePositiveInt(input.populationSize, "Population size");
  const confidence = requireConfidence(input.confidence);
  const tolerableRate = requireRate(input.tolerableRate, "Tolerable deviation rate");
  if (!Number.isInteger(input.expectedDeviations) || input.expectedDeviations < 0) {
    throw new Error("Expected deviations must be a whole number from 0 to 10.");
  }
  const expectedDeviations = input.expectedDeviations;
  const factor = reliabilityFactor(expectedDeviations, confidence);
  const unadjustedSampleSize = Math.ceil(factor / tolerableRate - 1e-9);
  const adjusted = unadjustedSampleSize / (1 + (unadjustedSampleSize - 1) / populationSize);
  let sampleSize = Math.ceil(adjusted - 1e-9);
  sampleSize = Math.max(1, Math.min(sampleSize, populationSize));
  const finitePopulationAdjusted = sampleSize < unadjustedSampleSize && sampleSize < populationSize;
  const fullPopulation = sampleSize === populationSize;
  const correction = finitePopulationAdjusted
    ? ` The finite-population correction reduced it from ${unadjustedSampleSize}.`
    : "";
  const coverage = fullPopulation ? " That is the entire population, so test every item." : "";
  const narrative =
    `Test ${sampleSize.toLocaleString("en-US")} of ${populationSize.toLocaleString("en-US")}. ` +
    `At ${formatConfidence(confidence)} confidence and ${expectedDeviations} expected ${deviationWord(expectedDeviations)}, ` +
    `the reliability factor is ${factor.toFixed(2)}, so the unadjusted sample is ${unadjustedSampleSize.toLocaleString("en-US")}.` +
    `${correction}${coverage} ` +
    `The plan is sized so the upper deviation limit stays at or under ${formatPercent(tolerableRate)} ` +
    `if you find no more than ${expectedDeviations} ${deviationWord(expectedDeviations)}.`;

  return {
    populationSize,
    confidence,
    tolerableRate,
    expectedDeviations,
    reliabilityFactor: roundFactor(factor),
    unadjustedSampleSize,
    sampleSize,
    finitePopulationAdjusted,
    fullPopulation,
    narrative,
  };
}

export function evaluateSample(input: SampleEvaluationInput): SampleEvaluation {
  const populationSize = requirePositiveInt(input.populationSize, "Population size");
  const sampleSize = requirePositiveInt(input.sampleSize, "Sample size");
  if (sampleSize > populationSize) {
    throw new Error("Sample size cannot be larger than the population.");
  }
  if (!Number.isInteger(input.exceptionsFound) || input.exceptionsFound < 0) {
    throw new Error("Exceptions found must be a whole number of 0 or more.");
  }
  if (input.exceptionsFound > sampleSize) {
    throw new Error("Exceptions cannot exceed the sample size.");
  }
  const confidence = requireConfidence(input.confidence);
  const tolerableRate = requireRate(input.tolerableRate, "Tolerable deviation rate");
  const fullPopulation = sampleSize === populationSize;
  const observedRate = input.exceptionsFound / sampleSize;
  const judgment =
    input.exceptionsFound > 0
      ? " A known exception still needs a conclusion: an isolated error and a control failure are not the same thing, and a key-control deviation is often a finding even when the upper limit is tolerable."
      : "";

  if (fullPopulation) {
    const statisticalSupport = observedRate <= tolerableRate + 1e-12;
    const narrative =
      `The entire population of ${populationSize.toLocaleString("en-US")} was tested. ` +
      `The observed deviation rate is ${formatPercent(observedRate)}. ` +
      (statisticalSupport
        ? `That is within the ${formatPercent(tolerableRate)} tolerable rate.`
        : `That is above the ${formatPercent(tolerableRate)} tolerable rate, so the test does not support operating effectiveness.`) +
      judgment;
    return {
      populationSize,
      sampleSize,
      exceptionsFound: input.exceptionsFound,
      confidence,
      tolerableRate,
      reliabilityFactor: null,
      upperDeviationRate: observedRate,
      observedRate,
      statisticalSupport,
      fullPopulation,
      narrative,
    };
  }

  const factor = reliabilityFactor(input.exceptionsFound, confidence);
  const upperDeviationRate = factor / sampleSize;
  const statisticalSupport = upperDeviationRate <= tolerableRate + 1e-12;
  const narrative =
    `${input.exceptionsFound} ${deviationWord(input.exceptionsFound)} in a sample of ${sampleSize.toLocaleString("en-US")} ` +
    `gives an upper deviation limit of ${formatPercent(upperDeviationRate)} at ${formatConfidence(confidence)} confidence ` +
    `(reliability factor ${factor.toFixed(2)}). ` +
    (statisticalSupport
      ? `That is within the ${formatPercent(tolerableRate)} tolerable rate, so the sample supports operating effectiveness for this attribute.`
      : `That is above the ${formatPercent(tolerableRate)} tolerable rate, so the sample does not support operating effectiveness. Expand the sample only if the firm's guide allows it; otherwise treat the control as ineffective.`) +
    judgment;

  return {
    populationSize,
    sampleSize,
    exceptionsFound: input.exceptionsFound,
    confidence,
    tolerableRate,
    reliabilityFactor: roundFactor(factor),
    upperDeviationRate,
    observedRate,
    statisticalSupport,
    fullPopulation,
    narrative,
  };
}

function roundFactor(factor: number): number {
  return Math.round(factor * 10000) / 10000;
}

export function presetForRisk(risk: "high" | "medium" | "low"): RiskPreset {
  if (risk === "high") {
    return {
      confidence: 0.95,
      tolerableRate: 0.05,
      expectedDeviations: 0,
      note: "High inherent risk: 95% confidence and a 5% tolerable deviation rate, expecting no deviations.",
    };
  }
  if (risk === "medium") {
    return {
      confidence: 0.9,
      tolerableRate: 0.1,
      expectedDeviations: 0,
      note: "Medium inherent risk: 90% confidence and a 10% tolerable deviation rate, expecting no deviations.",
    };
  }
  return {
    confidence: 0.9,
    tolerableRate: 0.1,
    expectedDeviations: 0,
    note: "Low inherent risk: 90% confidence and a 10% tolerable rate. A smaller procedure, including inquiry, may be enough if the firm's guide allows it.",
  };
}

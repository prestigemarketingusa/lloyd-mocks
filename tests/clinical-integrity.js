#!/usr/bin/env node
/* CLINICAL INTEGRITY GUARD — NHWL intake.
 *
 * Locks the intake's clinical structure to the authoritative live form. It exists because a
 * restyled mock once merged two DIFFERENT items into one auto-exclusion:
 *     "Current suicidal thoughts and/or prior suicidal attempt"
 * The authoritative form keeps them deliberately apart — current ideation auto-excludes, a prior
 * attempt goes to INDIVIDUAL CLINICAL REVIEW. The merged version silently auto-rejected every
 * patient with a past attempt, however long ago and however fully recovered.
 *
 * This guard makes no clinical judgement of its own. It only asserts that our page still matches
 * the authoritative source. Clinical eligibility decisions are not ours to make.
 *
 * Run: node tests/clinical-integrity.js            (checks local files)
 *      node tests/clinical-integrity.js --live     (also checks the deployed pages)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = [];
const fail = m => { failures.push(m); console.log('  ✗ ' + m); };
const pass = m => console.log('  ✓ ' + m);

function arr(html, name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\];');
  const m = html.match(re);
  if (!m) return null;
  return (m[1].match(/"(?:[^"\\]|\\.)*"/g) || []).map(s => JSON.parse(s));
}

function check(label, html) {
  console.log('\n' + label);
  const contra = arr(html, 'CONTRA'), health = arr(html, 'HEALTH');
  if (!contra || !health) { fail('could not parse CONTRA/HEALTH'); return; }

  // 1. the merge must never reappear, in any wording
  const merged = [...contra, ...health].filter(t =>
    /suicid/i.test(t) && /(and\/or|and or|\/|\bor\b)/i.test(t) && /(thought|ideation)/i.test(t) && /attempt/i.test(t));
  merged.length ? fail('MERGED suicide item present: "' + merged[0] + '"')
                : pass('no merged suicide item');

  // 2. current ideation must be an auto-exclusion
  contra.some(t => /current suicidal thoughts/i.test(t) && !/attempt/i.test(t))
    ? pass('"Current suicidal thoughts" is a Step-1 auto-exclusion')
    : fail('"Current suicidal thoughts" MISSING from auto-exclusions');

  // 3. prior attempt must be clinical review, never auto-exclusion
  health.some(t => /prior suicide attempt/i.test(t))
    ? pass('"Prior suicide attempt" is a Step-2 clinical-review item')
    : fail('"Prior suicide attempt" MISSING from clinical-review list');
  contra.some(t => /attempt/i.test(t))
    ? fail('a suicide ATTEMPT item is in the auto-exclusion list — must be clinical review')
    : pass('no attempt-based item auto-excludes');

  // 4. structure lock against the authoritative form
  const nContra = contra.filter(t => !/none of these/i.test(t)).length;
  nContra === 9 ? pass('9 auto-exclusions') : fail('expected 9 auto-exclusions, found ' + nContra);
  health.length === 18 ? pass('18 clinical-review items') : fail('expected 18 review items, found ' + health.length);
}

check('LOCAL  start/medical-intake.html', fs.readFileSync(path.join(ROOT, 'start/medical-intake.html'), 'utf8'));

// Spanish must translate these items, never restructure them
const es = fs.readFileSync(path.join(ROOT, 'start/nhwl-es.js'), 'utf8');
console.log('\nSPANISH language pack');
/Pensamientos suicidas actuales/.test(es) ? pass('ES has current-ideation string') : fail('ES missing current-ideation string');
/Intento suicida previo/.test(es) ? pass('ES has prior-attempt string (review)') : fail('ES missing prior-attempt string');
if (/Pensamientos suicidas actuales[^"]*intento/i.test(es)) fail('ES merges ideation and attempt into one string');
else pass('ES keeps ideation and attempt separate');

if (process.argv.includes('--live')) {
  const https = require('https');
  const get = u => new Promise((res, rej) => https.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej));
  get('https://prestigemarketingusa.github.io/lloyd-mocks/start/medical-intake.html')
    .then(h => { check('LIVE   deployed medical-intake.html', h); done(); })
    .catch(e => { fail('live fetch failed: ' + e.message); done(); });
} else done();

function done() {
  console.log('\n' + (failures.length ? 'FAILED (' + failures.length + ')' : 'ALL CLINICAL INTEGRITY CHECKS PASSED'));
  process.exit(failures.length ? 1 : 0);
}

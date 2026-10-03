// Runs the rotation engine off the main thread so the interface stays smooth on any phone.
import { buildClimate } from './data.js?v=1.13.1';
import { recommend, evaluateCustom, cropShift, finalize, weights } from './engine.js?v=1.13.1';

let key = null, base = null;
function getBase(raw) {
  const k = `${raw.lat},${raw.lon},${Object.keys(raw.monthly?.T2M || {}).length}`;
  if (k !== key) { base = buildClimate(raw); key = k; }
  return base;
}

self.onmessage = (e) => {
  const { id, type, raw, inp } = e.data;
  try {
    const b = getBase(raw);
    let res;
    if (type === 'recommend') res = recommend(b, inp);
    else if (type === 'shift') res = cropShift(b, inp);
    else if (type === 'custom') {
      const { r } = evaluateCustom(b, inp, e.data.seq, e.data.sec);
      if (r) finalize([r], weights(inp.prio), e.data.refGM || r.gm);
      res = r;
    }
    self.postMessage({ id, ok: true, res });
  } catch (err) {
    self.postMessage({ id, ok: false, err: String(err?.stack || err) });
  }
};

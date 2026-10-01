let ort, sess;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.t === 'init') {
    try {
      const src = m.ortSrc.replaceAll('import.meta.url', '"http://localhost/ort.mjs"');
      try { ort = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); }
      catch { ort = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src)); }
      ort.env.wasm.wasmBinary = m.wasm; ort.env.wasm.numThreads = 1; ort.env.logLevel = 'error';
      sess = await ort.InferenceSession.create(m.model, { executionProviders: [m.ep], graphOptimizationLevel: 'all' });
      const r = await sess.run({ input: new ort.Tensor('float32', new Float32Array(3 * 16 * 16).fill(0.5), [1, 3, 16, 16]) });
      const v = r.output.data[0];
      if (!(v > 0.2 && v < 0.8)) throw new Error('bad output');
      postMessage({ t: 'ready' });
    } catch (err) { postMessage({ t: 'fail', e: String(err && err.message || err) }); }
    return;
  }
  if (m.t === 'run') {
    try {
      const { w, h, px } = m; const n = w * h; const f = new Float32Array(3 * n);
      for (let i = 0, j = 0; i < n; i++, j += 4) { f[i] = px[j] / 255; f[n + i] = px[j + 1] / 255; f[2 * n + i] = px[j + 2] / 255; }
      const r = await sess.run({ input: new ort.Tensor('float32', f, [1, 3, h, w]) });
      const o = r.output.data; const W = w * 4, H = h * 4, N = W * H;
      const out = new Uint8ClampedArray(N * 4);
      for (let i = 0, j = 0; i < N; i++, j += 4) { out[j] = o[i] * 255; out[j + 1] = o[N + i] * 255; out[j + 2] = o[2 * N + i] * 255; out[j + 3] = 255; }
      r.output.dispose && r.output.dispose();
      postMessage({ t: 'done', id: m.id, w: W, h: H, px: out }, [out.buffer]);
    } catch (err) { postMessage({ t: 'err', id: m.id, e: String(err && err.message || err) }); }
  }
};

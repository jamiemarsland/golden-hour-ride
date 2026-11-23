/* The road samples are evenly spaced along the centreline. */
window.createElevationPreview = function ({canvas, title, metrics, points, length, openRoad = false, summitIndex = null}) {
  const ctx = canvas.getContext('2d');
  const intervals = openRoad ? points.length - 1 : points.length;
  const spacing = length / intervals;
  const summit = openRoad && Number.isInteger(summitIndex) ? summitIndex * spacing : null;
  let gainToSummit;
  if (summit !== null) {
    gainToSummit = new Float64Array(points.length);
    for (const direction of [-1, 1]) {
      for (let i = summitIndex + direction; i >= 0 && i < points.length; i += direction) {
        const next = i - direction;
        gainToSummit[i] = gainToSummit[next] + Math.max(0, points[next].y - points[i].y);
      }
    }
  }

  function bound(s) {
    if (openRoad) return Math.max(0, Math.min(length, s));
    return (s % length + length) % length;
  }
  function sample(s, gains = false) {
    const f = Math.min(intervals, bound(s) / spacing);
    const i = Math.min(Math.floor(f), intervals - 1);
    const next = (i + 1) % points.length;
    const a = gains ? gainToSummit[i] : points[i].y;
    const b = gains ? gainToSummit[next] : points[next].y;
    return a + (b - a) * (f - i);
  }
  function gradeColour(grade) {
    if (grade < -2) return '#70cbe5';
    if (grade < 2) return '#9bd7ac';
    if (grade < 6) return '#f4d17f';
    if (grade < 10) return '#f4a064';
    return '#f17d88';
  }
  const metres = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0});
  const legend = 'Blue downhill, green level, yellow 2–6%, orange 6–10%, pink 10% or steeper';
  canvas.title = legend;
  let lastChart = '';
  let crest = '';
  return {
    update(position, direction = 1, landmark = '') {
      if (canvas.hidden || !canvas.clientWidth || !canvas.clientHeight) return;
      const s = bound(position);
      const span = openRoad ? Math.min(1000, direction > 0 ? length - s : s) : 1000;
      let detail = metres.format(sample(s)) + ' m altitude';
      if (summit !== null && direction * (summit - s) >= -0.01) {
        detail += ' · ' + metres.format(sample(s, true)) + ' m ascent left';
      }
      if (metrics.textContent !== detail) metrics.textContent = detail;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const key = [Math.floor(s / 5), direction, width, height, ratio, span === 0].join('/');
      if (key !== lastChart) {
        lastChart = key;
        const pxWidth = Math.round(width * ratio), pxHeight = Math.round(height * ratio);
        if (canvas.width !== pxWidth) canvas.width = pxWidth;
        if (canvas.height !== pxHeight) canvas.height = pxHeight;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const segments = Math.ceil(span / 16);
        const step = segments ? span / segments : 0;
        const heights = Array.from({length:segments + 1}, (_, i) => sample(s + direction * step * i));
        const low = Math.min(...heights), range = Math.max(12, Math.max(...heights) - low);
        const y = h => height - 4 - (height - 8) * (h - low) / range;
        let steepest = 0;
        crest = '';
        for (let i = 1; i <= segments; i++) {
          const a = heights[i-1], b = heights[i];
          const x1 = 3 + (width-6) * (i-1) / segments, x2 = 3 + (width-6) * i / segments;
          const grade = 100 * (b-a) / step;
          steepest = Math.max(steepest, grade);
          const colour = gradeColour(grade);
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.22;
          ctx.beginPath();
          ctx.moveTo(x1, height); ctx.lineTo(x1, y(a)); ctx.lineTo(x2, y(b)); ctx.lineTo(x2, height);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x1, y(a)); ctx.lineTo(x2, y(b)); ctx.stroke();
          if (!crest && i >= 3 && i+3 < heights.length && b >= a && b > heights[i+1]
              && b - heights[i-3] > 0.6 && b - heights[i+3] > 0.6) {
            crest = ' · crest ' + Math.round(i * step) + ' m';
          }
        }
        ctx.fillStyle = '#fff5d9';
        ctx.beginPath();
        ctx.arc(3, y(heights[0]), 2.5, 0, Math.PI*2);
        ctx.fill();
        const label = span ? 'Next ' + Math.round(span) + ' metres. Steepest uphill grade ' + Math.round(steepest) + '%.' : 'End of road.';
        canvas.setAttribute('aria-label', label + ' ' + legend);
      }
      const heading = (landmark || (span >= 1000 ? 'Next kilometre' : span > 0 ? 'Next ' + Math.ceil(span) + ' m' : 'End of road')) + crest;
      if (title.textContent !== heading) title.textContent = heading;
    }
  };
};

(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var accent3 = style.getPropertyValue('--accent3').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var colors = [accent, accent2, accent3, '#f472b6', '#facc15', '#a78bfa'];

  var products = [
    { name: 'Flipper Zero', values: [5, 5, 5, 5, 5, 5] },
    { name: 'Pwnagotchi', values: [5, 3, 4, 5, 3, 5] },
    { name: 'Miyoo Mini Plus', values: [5, 3, 5, 5, 5, 5] },
    { name: 'M5Stack Cardputer', values: [3, 2, 4, 5, 5, 5] },
    { name: 'RTL-SDR', values: [4, 2, 5, 5, 5, 5] },
    { name: 'Nintendo Switch', values: [5, 5, 5, 5, 3, 4] }
  ];

  var indicators = [
    { name: '话题性', max: 5 },
    { name: '矛盾性', max: 5 },
    { name: '社区活跃度', max: 5 },
    { name: '软件扩展性', max: 5 },
    { name: '入门友好度', max: 5 },
    { name: 'Vibe Coding潜力', max: 5 }
  ];

  var chartRadar = echarts.init(document.getElementById('chart-radar'), null, { renderer: 'svg' });
  chartRadar.setOption({
    animation: false,
    textStyle: {
      color: muted,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      backgroundColor: bg2,
      borderColor: rule,
      textStyle: { color: ink }
    },
    legend: {
      data: products.map(function(p) { return p.name; }),
      bottom: 0,
      textStyle: { color: muted, fontSize: 11 },
      itemWidth: 14,
      itemHeight: 10,
      itemGap: 12
    },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 5,
      axisName: {
        color: ink,
        fontSize: 12,
        fontWeight: 600
      },
      splitLine: {
        lineStyle: { color: rule }
      },
      splitArea: {
        areaStyle: {
          color: ['transparent', 'rgba(255,107,53,0.02)', 'transparent', 'rgba(0,212,170,0.02)', 'transparent']
        }
      },
      axisLine: {
        lineStyle: { color: rule }
      }
    },
    series: [{
      type: 'radar',
      data: products.map(function(p, i) {
        return {
          value: p.values,
          name: p.name,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            width: 2,
            color: colors[i]
          },
          areaStyle: {
            color: colors[i],
            opacity: 0.1
          },
          itemStyle: {
            color: colors[i]
          }
        };
      })
    }]
  });

  window.addEventListener('resize', function() { chartRadar.resize(); });
})();

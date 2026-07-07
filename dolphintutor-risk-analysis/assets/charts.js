// assets/charts.js
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart 1: 合规状态分布（环形图） ---
  var chart1 = echarts.init(document.getElementById('chart-status'), null, { renderer: 'svg' });
  chart1.setOption({
    tooltip: { trigger: 'item', appendToBody: true },
    legend: { bottom: 8, textStyle: { color: muted, fontSize: 13 } },
    series: [{
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: true,
      label: { show: true, fontSize: 14, fontWeight: 'bold', color: ink },
      labelLine: { length: 12, length2: 8 },
      data: [
        { value: 9, name: '通过 ✅', itemStyle: { color: '#4caf50' } },
        { value: 3, name: '需关注 ⚠️', itemStyle: { color: '#ff9800' } },
        { value: 1, name: '风险 🔴', itemStyle: { color: '#f44336' } },
      ],
    }],
    animation: false,
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: 风险严重程度（横向条形图） ---
  var chart2 = echarts.init(document.getElementById('chart-severity'), null, { renderer: 'svg' });
  chart2.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, appendToBody: true },
    grid: { left: 180, right: 40, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      max: 10,
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontSize: 12 },
      splitLine: { lineStyle: { color: rule, opacity: 0.3 } },
    },
    yAxis: {
      type: 'category',
      data: ['CSP 开发环境残留', 'BadUSB 无沙箱机制', 'API Key 文案不一致', 'themes-pack 版权风险'],
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: ink, fontSize: 12 },
    },
    series: [{
      type: 'bar',
      data: [
        { value: 2, itemStyle: { color: '#ff9800' } },
        { value: 5, itemStyle: { color: '#ff5722' } },
        { value: 4, itemStyle: { color: '#ff9800' } },
        { value: 7, itemStyle: { color: '#f44336' } },
      ],
      barWidth: '50%',
      label: { show: true, position: 'right', fontSize: 12, color: ink, formatter: '{c}/10' },
    }],
    animation: false,
  });
  window.addEventListener('resize', function() { chart2.resize(); });
})();

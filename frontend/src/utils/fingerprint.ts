export async function getDeviceFingerprint(): Promise<object> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
  }
  const canvasFp = canvas.toDataURL();

  const gl = document.createElement('canvas').getContext('webgl');
  let webglFp = '';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      webglFp = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) + '|' + gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    }
  }

  const fonts = [
    'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
    'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
    'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Sans Unicode',
    'Tahoma', 'Calibri', 'Cambria', 'Candara', 'Consolas',
  ];
  const detectedFonts = fonts.filter(font => {
    const test = document.createElement('span');
    test.style.fontFamily = font;
    test.style.fontSize = '72px';
    test.textContent = 'mmmmmmmmmmlli';
    test.style.position = 'absolute';
    test.style.left = '-9999px';
    document.body.appendChild(test);
    const width = test.offsetWidth;
    document.body.removeChild(test);
    return width !== 0;
  });

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const analyser = audioCtx.createAnalyser();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0;
  oscillator.connect(analyser);
  analyser.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 10000;
  oscillator.start(0);
  oscillator.stop(0.01);
  const audioFp = audioCtx.sampleRate.toString();
  audioCtx.close();

  const battery = await (navigator as any).getBattery?.();

  return {
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
    },
    navigator: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    canvas: canvasFp.slice(0, 100),
    webgl: webglFp.slice(0, 100),
    fonts: detectedFonts,
    audio: audioFp,
    battery: battery ? {
      level: battery.level,
      charging: battery.charging,
    } : null,
  };
}

export function getRiskTierColor(tier?: string | null): string {
  const t = (tier || '').toLowerCase();
  switch (t) {
    case 'low': return 'text-risk-low';
    case 'medium': return 'text-risk-medium';
    case 'high': return 'text-risk-high';
    case 'critical': return 'text-risk-critical';
    default: return 'text-gray-500';
  }
}

export function getRiskTierBg(tier?: string | null): string {
  const t = (tier || '').toLowerCase();
  switch (t) {
    case 'low': return 'bg-risk-low/10 border-risk-low/20';
    case 'medium': return 'bg-risk-medium/10 border-risk-medium/20';
    case 'high': return 'bg-risk-high/10 border-risk-high/20';
    case 'critical': return 'bg-risk-critical/10 border-risk-critical/20';
    default: return 'bg-gray-100 border-gray-200';
  }
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
(function () {
  try {
    var stored = localStorage.getItem('pmv_theme') || 'system'
    if (stored !== 'light' && stored !== 'dark' && stored !== 'system') stored = 'system'
    var resolved = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : stored
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.themePreference = stored
    document.documentElement.style.colorScheme = resolved
  } catch (_) {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
})()

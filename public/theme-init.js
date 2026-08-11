(function () {
  try {
    var host = window.location.hostname
    var path = window.location.pathname
    var isDedicatedWorkspace = host.indexOf('hq.') === 0 || host.indexOf('client.') === 0 || host.indexOf('secure.') === 0 || host.indexOf('mail.') === 0
    var isEmbeddedWorkspace = /^\/(portal|admin)(\/|$)/.test(path)

    // The public brand is intentionally navy, white, and gold. Theme choice is
    // reserved for authenticated workspaces so a visitor's OS preference cannot
    // wash out the crest or invert the marketing experience before React loads.
    if (!isDedicatedWorkspace && !isEmbeddedWorkspace) {
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.dataset.themePreference = 'dark'
      document.documentElement.style.colorScheme = 'dark'
      return
    }

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

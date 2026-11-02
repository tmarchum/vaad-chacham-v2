// App-wide toast — ONE way to show feedback. Layout.jsx listens for the
// 'app-toast' event and renders the stack; everything else calls these.
export function toast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }))
}

export const toastError = (message) => toast(message, 'error')

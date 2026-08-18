let magicKey = ';'; // Default

// Initial load
chrome.storage.local.get(['user'], (data) => {
  if (data.user && data.user.magicKey) {
    magicKey = data.user.magicKey;
  }
});

// Listen for updates from storage directly (syncing from website)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.user && changes.user.newValue) {
    if (changes.user.newValue.magicKey) {
      magicKey = changes.user.newValue.magicKey;
    }
  }
});

function displayDiscreetly(answer) {
  chrome.runtime.sendMessage({ action: "updateBookmark", text: answer });
}

window.addEventListener('keydown', (event) => {
  let highlightedText = window.getSelection().toString()
  if (event.key === magicKey && highlightedText.length > 0) {
    event.preventDefault();
    event.stopImmediatePropagation();
    
    displayDiscreetly("⏳");

    chrome.runtime.sendMessage({
      action: "getAnswer",
      question: highlightedText
    }, (response) => {
      displayDiscreetly(response?.answer || "❌");
    });
  }
}, { capture: true });

function displayDiscreetly(answer) {
  chrome.runtime.sendMessage({ action: "updateBookmark", text: answer });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'ù') {
    event.preventDefault();
    event.stopImmediatePropagation();
    
    displayDiscreetly("⏳ Recherche...");

    chrome.runtime.sendMessage({
      action: "getAnswer",
      question: window.getSelection().toString()
    }, (response) => {
      displayDiscreetly(response?.answer || "❌ Erreur");
    });
  }
}, { capture: true });

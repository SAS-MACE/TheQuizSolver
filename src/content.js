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

window.addEventListener('dblclick', (event) => {
  let elementText = event.target.innerText;
  if (!elementText) {
    elementText = event.target.textContent;
  }
  elementText = (elementText || "").trim();

  // let pageText = document.body.innerText || document.body.textContent || "";

  if (elementText.length > 0) {
    displayDiscreetly("⏳");

    chrome.runtime.sendMessage({
      action: "getAnswer",
      question: elementText,
      // pageText: pageText
    }, (response) => {
      if (response && response.answer) {
        displayDiscreetly(response.answer);
        clickOnAnswer(response.answer);
      } else {
        displayDiscreetly("❌");
      }
    });
  }
}, { capture: true });

function clickOnAnswer(correctAnswerText) {
  if (!correctAnswerText) return;
  const possibleAnswers = document.querySelectorAll('*'); 
  let cleanAnswer = correctAnswerText.trim().toLowerCase();
  for (let el of possibleAnswers) {
    let text = el.innerText || el.textContent || "";
    let cleanText = text.trim().toLowerCase();
    if(cleanText.length>0 && cleanText.length<40){
    if (cleanText.includes(cleanAnswer) || cleanAnswer.includes(cleanText)) {
      el.click();
      // break;
    }
  }
  }
}

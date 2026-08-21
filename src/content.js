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

function displayDiscreetly(answer, url) {
  chrome.runtime.sendMessage({ action: "updateBookmark", text: answer, url: url });
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
      if (response && response.answer && response.answer.error === "NOT_LOGGED_IN") {
        displayDiscreetly(response.answer.message, "https://www.thequizsolver.com/register");
        window.open("https://www.thequizsolver.com/register", "_blank");
      } else {
        displayDiscreetly(response?.answer || "❌");
      }
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
        if (typeof response.answer === 'object' && response.answer.error === "NOT_LOGGED_IN") {
          displayDiscreetly(response.answer.message, "https://www.thequizsolver.com/register");
          window.open("https://www.thequizsolver.com/register", "_blank");
        } else {
          displayDiscreetly(response.answer);
          let clicked = clickOnAnswer(response.answer);
          if (!clicked) {
            fillInputWithAnswer(response.answer, event.target);
          }
        }
      } else {
        displayDiscreetly("❌");
      }
    });
  }
}, { capture: true });

function clickOnAnswer(correctAnswerText) {
  if (!correctAnswerText) return false;
  const possibleAnswers = document.querySelectorAll('*'); 
  let cleanAnswer = correctAnswerText.trim().toLowerCase();
  let clickedSomething = false;
  for (let el of possibleAnswers) {
    let text = el.innerText || el.textContent || "";
    let cleanText = text.trim().toLowerCase();
    if (cleanText.length > 0 && cleanText.length < 40) {
      if (cleanText.includes(cleanAnswer) || cleanAnswer.includes(cleanText)) {
        el.click();
        clickedSomething = true;
        // break;
      }
    }
  }
  return clickedSomething;
}

function findClosestInput(startElement) {
  const inputSelectors = 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]), textarea';
  
  function getFirstEmptyInput(elements) {
    for (let i = 0; i < elements.length; i++) {
      if (!elements[i].value || elements[i].value.trim() === '') {
        return elements[i];
      }
    }
    return null;
  }

  // 1. Check if the element itself or its children contain an input
  let inputs = startElement.querySelectorAll ? startElement.querySelectorAll(inputSelectors) : [];
  let emptyInput = getFirstEmptyInput(inputs);
  if (emptyInput) return emptyInput;

  // 2. Traverse up the DOM tree and look inside ancestors
  let current = startElement.parentElement;
  while (current && current !== document.body && current !== null) {
    let parentInputs = current.querySelectorAll(inputSelectors);
    emptyInput = getFirstEmptyInput(parentInputs);
    if (emptyInput) return emptyInput;
    
    current = current.parentElement;
  }
  
  // 3. Fallback: return the first empty input on the page
  return getFirstEmptyInput(document.querySelectorAll(inputSelectors) || []);
}

function fillInputWithAnswer(answerText, targetElement) {
  if (!answerText || !targetElement) return;
  const input = findClosestInput(targetElement);
  if (input) {
    input.value = answerText;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }
}

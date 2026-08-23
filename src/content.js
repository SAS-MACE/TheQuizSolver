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
      question: highlightedText,
      infos: {eventFrom: "magicKey"}
    }, (response) => {
      if (response && response.answer && response.answer.error === "NOT_LOGGED_IN") {
        displayDiscreetly(response.answer.message, response.answer.message);
        window.open(response.answer.message+"/register", "_blank");
      } else {
        displayDiscreetly(response?.answer || "❌");
      }
    });
  }
}, { capture: true });

window.addEventListener('dblclick', (event) => {
  // alert("ok")
  // return;
  let elementText = event.target.value || event.target.innerText || event.target.textContent || "";
  
  const disabledChild = event.target.querySelectorAll('input[disabled], textarea[disabled]');
  disabledChild.forEach(element => {
    elementText+= element.value || "";
  });
  
  elementText = elementText.trim();

  // let pageText = document.body.innerText || document.body.textContent || "";

  if (elementText.length > 0) {
    displayDiscreetly("⏳");
    chrome.runtime.sendMessage({
      action: "getAnswer",
      question: elementText,
      infos: {eventFrom: "dblclick"},
      pageText: getContextText(event.target),
    }, (response) => {
      if (response && response.answer) {
        if (typeof response.answer === 'object' && response.answer.error === "NOT_LOGGED_IN") {
          displayDiscreetly(response.answer.message, response.answer.message);
          window.open(response.answer.message+"/register", "_blank");
        } else {
          displayDiscreetly(response.answer);
          let clicked = clickOnAnswer(response.answer, event.target);
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

function clickOnAnswer(correctAnswerText, questionElement) {
  if (!correctAnswerText) return false;
  let cleanAnswer = correctAnswerText.trim().toLowerCase();

  const allElements = Array.from(document.querySelectorAll('*'));
  const elementsData = [];
  
  for (let i = 0; i < allElements.length; i++) {
    let el = allElements[i];
    let text = el.value || el.innerText || el.textContent || "";
    let cleanText = text.trim().toLowerCase();
    if (cleanText.length > 0 && cleanText.length < 40) {
      elementsData.push({ el, cleanText, index: i });
    }
  }

  let clickedSomething = false;

  // 1. Essai avec logique de proximité (si questionElement est fourni)
  if (questionElement) {
    const questionIndex = allElements.indexOf(questionElement);
    if (questionIndex !== -1) {
      const proximalElements = elementsData.filter(item => {
        if (item.index <= questionIndex) return false;
        try {
          const range = document.createRange();
          range.setStartAfter(questionElement);
          range.setEndBefore(item.el);
          return range.toString().trim().length <= 200;
        } catch(e) { return false; }
      });

      // Passe 1 Proximité : Correspondance exacte
      for (const item of proximalElements) {
        if (cleanAnswer === item.cleanText) {
          item.el.click();
          clickedSomething = true;
        }
      }
      if (clickedSomething) return true;

      // Passe 2 Proximité : Correspondance partielle
      for (const item of proximalElements) {
        if (item.cleanText.includes(cleanAnswer) || (cleanAnswer.includes(item.cleanText) && item.cleanText.length > 1)) {
          item.el.click();
          clickedSomething = true;
        }
      }
      if (clickedSomething) return true;
    }
  }

  // 2. Fallback (comportement global par défaut)
  // Passe 1 Globale : Correspondance exacte
  for (const item of elementsData) {
    if (cleanAnswer === item.cleanText) {
      item.el.click();
      clickedSomething = true;
    }
  }
  if (clickedSomething) return true;

  // Passe 2 Globale : Correspondance partielle
  for (const item of elementsData) {
    if (item.cleanText.includes(cleanAnswer) || (cleanAnswer.includes(item.cleanText) && item.cleanText.length > 1)) {
      item.el.click();
      clickedSomething = true;
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

  // 1. Chercher le premier input vide situé APRÈS la question dans le DOM
  const allElements = Array.from(document.querySelectorAll('*'));
  const startIndex = allElements.indexOf(startElement);
  
  if (startIndex !== -1) {
    const inputsAfter = [];
    for (let i = startIndex + 1; i < allElements.length; i++) {
      if (allElements[i].matches && allElements[i].matches(inputSelectors)) {
        inputsAfter.push(allElements[i]);
      }
    }
    let emptyInputAfter = getFirstEmptyInput(inputsAfter);
    if (emptyInputAfter) return emptyInputAfter;
  }

  // 2. Si rien trouvé après, chercher le plus proche structurellement (enfants puis parents)
  let inputs = startElement.querySelectorAll ? startElement.querySelectorAll(inputSelectors) : [];
  let emptyInput = getFirstEmptyInput(inputs);
  if (emptyInput) return emptyInput;

  let current = startElement.parentElement;
  while (current && current !== document.body && current !== null) {
    let parentInputs = current.querySelectorAll(inputSelectors);
    emptyInput = getFirstEmptyInput(parentInputs);
    if (emptyInput) return emptyInput;
    
    current = current.parentElement;
  }
  
  // 3. Fallback: premier input vide de la page
  return getFirstEmptyInput(document.querySelectorAll(inputSelectors) || []);
}

function fillInputWithAnswer(answerText, targetElement) {
  if (!answerText || !targetElement) return;
  const input = findClosestInput(targetElement);
  if (input) {
    input.value = answerText;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
  }
}

function getContextText(element) {
  let current = element;
  while (current && current !== document.body && current !== document.documentElement) {
    let text = current.innerText || current.textContent || "";
    text = text.trim();
    if (text.length >= 100) {
      return text;
    }
    current = current.parentElement;
  }
  return current ? (current.innerText || current.textContent || "").trim() : "";
}

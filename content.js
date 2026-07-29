let keysPressed = {};

// État du mode IA
let inExtensionMode = false;
let currentModel = 'lite'; // 'lite' ou 'pro'
let currentInput = 'text'; // 'text' ou 'screenshot'

let isTypingPrompt = false;
let customPrompt = "";

function updateStatusDisplay() {
  if (inExtensionMode) {
    chrome.runtime.sendMessage({
      action: "updateBookmark",
      text: `${currentModel.toUpperCase()}|${currentInput === 'text' ? 'Text' : 'Visu'}`
    });
  } else {
    chrome.runtime.sendMessage({
      action: "updateBookmark",
      text: 'Google'
    });
  }
}

// Écoute les touches pressées
window.addEventListener('keydown', (event) => {
  const key = event.key;

  if (key === 'ù') {
    event.preventDefault();
    event.stopImmediatePropagation();
    inExtensionMode = !inExtensionMode;
    updateStatusDisplay();
    return;
  }

  if (inExtensionMode) {
    // Empêche le navigateur de détecter les touches du mode IA
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key === 'ArrowLeft') {
      isTypingPrompt = !isTypingPrompt;
      if (isTypingPrompt) {
        customPrompt = "";
        chrome.runtime.sendMessage({
          action: "updateBookmark",
          text: " "
        });
      } else {
        displayDiscreetly("✅ OK");
        setTimeout(() => updateStatusDisplay(), 1000);
      }
      return;
    }

    if (isTypingPrompt) {
      if (key === 'Backspace') {
        customPrompt = customPrompt.slice(0, -1);
      } else if (key.length === 1) {
        customPrompt += key;
      }
      chrome.runtime.sendMessage({
        action: "updateBookmark",
        text: customPrompt || " "
      });
      return;
    }

    if (key.toLowerCase() === 'm') {
      currentModel = currentModel === 'lite' ? 'pro' : 'lite';
      updateStatusDisplay();
    } else if (key.toLowerCase() === 'i') {
      currentInput = currentInput === 'text' ? 'screenshot' : 'text';
      updateStatusDisplay();
    } else if (key === 'ArrowRight') {
      const selectedText = window.getSelection().toString().trim();

      displayDiscreetly("⏳ Recherche...");
      inExtensionMode = false;

      chrome.runtime.sendMessage({
        action: "getAnswer",
        model: currentModel,
        inputType: currentInput,
        question: selectedText,
        customPrompt: customPrompt
      }, (response) => {
        if (response && response.answer) {
          displayDiscreetly(response.answer);
        } else {
          displayDiscreetly("❌ Erreur");
        }
      });
    }
  }
}, { capture: true });

// Affiche le texte discrètement dans le favori
function displayDiscreetly(answer) {
  chrome.runtime.sendMessage({
    action: "updateBookmark",
    text: `${answer}`,
    timeout: 10000
  });
}

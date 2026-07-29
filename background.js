// REMPLACEZ CETTE VALEUR PAR VOTRE CLÉ D'API GEMINI
const GEMINI_API_KEY = 'AQ.Ab8RN6IpGlUe6R02j4QaGUUEvxQPqhkfEsRZjyoEH4yKThMkSQ';

let answerBookmarkId = null;
let bookmarkTimeout = null;

function initAnswerBookmark() {
  chrome.bookmarks.getChildren('1', (children) => {
    if (children && children.length > 0) {
      // On prend le tout premier favori de la barre
      answerBookmarkId = children[0].id;
    } else {
      // S'il n'y a aucun favori, on en crée un
      chrome.bookmarks.create({
        parentId: '1',
        title: 'Google',
        url: 'https://google.com'
      }, (newBookmark) => {
        answerBookmarkId = newBookmark.id;
      });
    }
  });
}

initAnswerBookmark();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBookmark") {
    if (answerBookmarkId) {
      chrome.bookmarks.update(answerBookmarkId, { title: request.text });
      if (bookmarkTimeout) clearTimeout(bookmarkTimeout);
      if (request.timeout) {
        bookmarkTimeout = setTimeout(() => {
          chrome.bookmarks.update(answerBookmarkId, { title: 'Google' });
        }, request.timeout);
      }
    }
    return false;
  }

  if (request.action === "getAnswer") {
    handleAnswerRequest(request)
      .then(answer => sendResponse({ answer }))
      .catch(error => {
        console.error("Erreur lors de la récupération de la réponse:", error);
        sendResponse({ answer: "Erreur" });
      });

    // Retourne true pour indiquer qu'on va envoyer la réponse de manière asynchrone
    return true;
  }
});

async function handleAnswerRequest(request) {
  let imageDataUrl = null;

  if (request.inputType === 'screenshot') {
    // Capture visible tab
    imageDataUrl = await new Promise((resolve) => {
      console.log("a")
      chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 }, (dataUrl) => {
        resolve(dataUrl);
      });
      console.log("b")
    });
  }

  console.log(imageDataUrl)
  return await fetchAnswerFromGemini(request.question, request.model, imageDataUrl, request.customPrompt);
}

async function fetchAnswerFromGemini(question, modelChoice, imageDataUrl, customPrompt) {
  if (GEMINI_API_KEY === 'VOTRE_CLE_API_ICI') {
    return "Clé API manquante";
  }

  const modelId = modelChoice === 'pro' ? 'gemini-3.5-flash' : 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;

  let promptText = `Réponds très brièvement à cette question de quiz. Donne uniquement la réponse courte, sans aucune explication supplémentaire, pour que ça tienne dans le nom d'un favori de navigateur: ${question || ''}`;

  if (customPrompt) {
    promptText += `\n\nInstruction supplémentaire : ${customPrompt}`;
  }

  let parts = [{ text: promptText }];

  // Si on a une image, on l'ajoute à la requête
  if (imageDataUrl) {
    // L'URL data est au format: data:image/jpeg;base64,...
    const base64Data = imageDataUrl.split(',')[1];
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: base64Data
      }
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts }]
    })
  });

  console.log(parts)

  if (!response.ok) {
    throw new Error(`Erreur API: ${response.status}`);
  }

  const data = await response.json();

  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].content.parts[0].text.trim();
  } else {
    return "Aucune réponse trouvée";
  }
}
